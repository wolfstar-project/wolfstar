import { writeSettings } from '#lib/database';
import type { ModerationManager } from '#lib/moderation';
import { fetchGuildT, getEmbed, getUndoTaskId, getUndoTaskName, UndoTaskJobOptions } from '#lib/moderation/common';
import { resolveOnErrorCodes } from '#common';
import { getModeration } from '#utils/functions';
import { isNullishOrZero } from '@sapphire/utilities';
import { Listener } from '@wolfstar/http-framework';
import { canSendEmbeds } from '@wolfstar/http-framework-utilities/gateway';
import { MessageReferenceType, RESTJSONErrorCodes, Routes, type RESTPostAPIChannelMessageJSONBody } from 'discord-api-types/v10';

export class UserListener extends Listener {
	public run(entry: ModerationManager.Entry) {
		return Promise.all([this.sendMessage(entry), this.scheduleDuration(entry)]);
	}

	private async sendMessage(entry: ModerationManager.Entry) {
		const moderation = await getModeration(entry.guild);
		const channel = await moderation.fetchChannel();
		if (channel === null || !(await canSendEmbeds(channel))) return;

		const t = await fetchGuildT(entry.guild);
		const options = { embeds: [(await getEmbed(t, entry)).toJSON()] };
		try {
			await resolveOnErrorCodes(channel.send(options), RESTJSONErrorCodes.MissingAccess, RESTJSONErrorCodes.MissingPermissions);
		} catch {
			await writeSettings(entry.guild, { moderationChannel: null }, this.container.gatewayClient.user!.id);
			return;
		}

		await this.forwardMessage(entry, channel.id);
	}

	/**
	 * Forwards the message a case is about to the moderation log, under the case: a forward keeps what the message
	 * said, so it is still there after the message is deleted.
	 *
	 * @remarks The message may be gone already (a ban that deletes the messages of the user), or in a channel the bot
	 * cannot read: the case links to it either way, so a forward that fails is only logged.
	 */
	private async forwardMessage(entry: ModerationManager.Entry, logChannelId: string) {
		const reference = entry.messageReference;
		if (reference === null) return;

		const body: RESTPostAPIChannelMessageJSONBody = {
			message_reference: {
				type: MessageReferenceType.Forward,
				guild_id: entry.guild.id,
				channel_id: reference.channelId,
				message_id: reference.messageId,
				fail_if_not_exists: false
			}
		};
		await this.container.rest
			.post(Routes.channelMessages(logChannelId), { body })
			.catch((error: unknown) => this.container.logger.debug(`[MODERATION] Could not forward the message of case ${entry.id}:`, error));
	}

	private async scheduleDuration(entry: ModerationManager.Entry) {
		if (isNullishOrZero(entry.duration)) return;

		const taskName = getUndoTaskName(entry.type);
		if (taskName === null) return;

		await this.container.tasks
			.create(
				{
					name: taskName,
					payload: {
						caseID: entry.id,
						userID: entry.userId,
						guildID: entry.guild.id,
						duration: entry.duration,
						extraData: entry.extraData
					}
				},
				{
					repeated: false,
					delay: Math.max(0, entry.expiresTimestamp! - Date.now()),
					customJobOptions: { jobId: getUndoTaskId(entry.guild.id, entry.id), ...UndoTaskJobOptions }
				}
			)
			.catch((error) => this.container.logger.fatal(error));
	}
}
