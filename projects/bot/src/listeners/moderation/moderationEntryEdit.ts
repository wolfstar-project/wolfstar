import { writeSettings } from '#lib/database';
import type { ModerationManager, ModerationManagerEntry } from '#lib/moderation';
import { fetchGuildT, getEmbed, getUndoTaskId, getUndoTaskName, UndoTaskJobOptions } from '#lib/moderation/common';
import type { GuildTextBasedChannel } from '#lib/moderation/managers/LoggerManager';
import { resolveOnErrorCodes } from '#common';
import { getModeration } from '#utils/functions';
import { isUserSelf } from '#utils/util';
import { DiscordAPIError } from '@discordjs/rest';
import { isNullish } from '@sapphire/utilities';
import { Listener } from '@wolfstar/http-framework';
import { canSendEmbeds } from '@wolfstar/http-framework-utilities/gateway';
import type { Embed, Message } from '@wolfstar/plugin-gateway';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';

export class UserListener extends Listener {
	public run(old: ModerationManager.Entry, entry: ModerationManager.Entry) {
		return Promise.all([this.scheduleDuration(old, entry), this.sendMessage(old, entry)]);
	}

	private async scheduleDuration(old: ModerationManager.Entry, entry: ModerationManager.Entry) {
		// If the entry has been archived in this update, delete the task:
		if (entry.isArchived() || entry.isCompleted()) {
			await this.#tryDeleteTask(await entry.fetchTask());
			return;
		}

		if (old.duration === entry.duration) return;

		const task = await entry.fetchTask();
		if (isNullish(task)) {
			if (entry.duration !== null) await this.#createNewTask(entry);
		} else if (entry.duration === null) {
			// If the new duration is null, delete the previous task:
			await this.#tryDeleteTask(task);
		} else {
			// If the new duration is not null, reschedule the previous task:
			await task.changeDelay(Math.max(0, entry.expiresTimestamp! - Date.now()));
		}
	}

	private async sendMessage(old: ModerationManager.Entry, entry: ModerationManager.Entry) {
		if (entry.isArchived() || this.#isCompleteUpdate(old, entry)) return;

		const moderation = await getModeration(entry.guild);
		const channel = await moderation.fetchChannel();
		if (channel === null || !(await canSendEmbeds(channel))) return;

		const t = await fetchGuildT(entry.guild);
		const previous = await this.fetchModerationLogMessage(entry, channel);
		const options = { embeds: [(await getEmbed(t, entry)).toJSON()] };
		try {
			await resolveOnErrorCodes(
				previous === null ? channel.send(options) : this.container.gatewayClient.messages.edit(channel.id, previous.id, options),
				RESTJSONErrorCodes.MissingAccess,
				RESTJSONErrorCodes.MissingPermissions
			);
		} catch {
			await writeSettings(entry.guild, { moderationChannel: null }, this.container.gatewayClient.user!.id);
		}
	}

	private async fetchModerationLogMessage(entry: ModerationManager.Entry, channel: GuildTextBasedChannel) {
		const messages = await this.fetchChannelMessages(channel);
		for (const message of messages) {
			if (this.#validateModerationLogMessage(message, entry.id)) return message;
		}

		return null;
	}

	/**
	 * Fetch 100 messages from the modlogs channel
	 */
	private async fetchChannelMessages(channel: GuildTextBasedChannel, remainingRetries = 5): Promise<Message[]> {
		try {
			return await this.container.gatewayClient.messages.list(channel.id, { limit: 100 });
		} catch (error) {
			if (error instanceof DiscordAPIError || remainingRetries <= 0) throw error;
			return this.fetchChannelMessages(channel, --remainingRetries);
		}
	}

	#isCompleteUpdate(old: ModerationManager.Entry, entry: ModerationManager.Entry) {
		return !old.isCompleted() && entry.isCompleted();
	}

	async #tryDeleteTask(task: ModerationManagerEntry.ScheduledTask | null) {
		if (!isNullish(task) && !(await task.isActive())) await task.remove();
	}

	#validateModerationLogMessage(message: Message, caseId: number) {
		return (
			isUserSelf(message.author.id) &&
			message.attachments.size === 0 &&
			message.embeds.length === 1 &&
			this.#validateModerationLogMessageEmbed(message.embeds[0]) &&
			message.embeds[0].footer!.text.includes(caseId.toString())
		);
	}

	#validateModerationLogMessageEmbed(embed: Embed) {
		return (
			this.#validateModerationLogMessageEmbedAuthor(embed.author) &&
			this.#validateModerationLogMessageEmbedDescription(embed.description) &&
			this.#validateModerationLogMessageEmbedColor(embed.color) &&
			this.#validateModerationLogMessageEmbedFooter(embed.footer) &&
			this.#validateModerationLogMessageEmbedTimestamp(embed.timestamp)
		);
	}

	#validateModerationLogMessageEmbedAuthor(author: Embed['author']) {
		return author !== null && typeof author.name === 'string' && /\(\d{17,19}\)$/.test(author.name) && typeof author.iconURL === 'string';
	}

	#validateModerationLogMessageEmbedDescription(description: Embed['description']) {
		return typeof description === 'string' && description.split('\n').length >= 3;
	}

	#validateModerationLogMessageEmbedColor(color: Embed['color']) {
		return !isNullish(color);
	}

	#validateModerationLogMessageEmbedFooter(footer: Embed['footer']) {
		return footer !== null && typeof footer.text === 'string' && typeof footer.iconURL === 'string';
	}

	#validateModerationLogMessageEmbedTimestamp(timestamp: Embed['timestamp']) {
		return !isNullish(timestamp);
	}

	async #createNewTask(entry: ModerationManager.Entry) {
		const taskName = getUndoTaskName(entry.type);
		if (isNullish(taskName)) return;

		await this.container.tasks.create(
			{
				name: taskName,
				payload: {
					caseID: entry.id,
					userID: entry.userId,
					guildID: entry.guild.id,
					duration: entry.duration!,
					extraData: entry.extraData
				}
			},
			{
				repeated: false,
				delay: Math.max(0, entry.expiresTimestamp! - Date.now()),
				customJobOptions: { jobId: getUndoTaskId(entry.guild.id, entry.id), ...UndoTaskJobOptions }
			}
		);
	}
}
