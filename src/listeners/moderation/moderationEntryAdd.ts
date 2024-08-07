import { writeSettings } from '#lib/database';
import type { ModerationManager } from '#lib/moderation';
import { getEmbed, getUndoTaskName } from '#lib/moderation/common';
import { resolveOnErrorCodes } from '#utils/common';
import { getModeration } from '#utils/functions';
import { canSendEmbeds } from '@sapphire/discord.js-utilities';
import { Listener } from '@sapphire/framework';
import { fetchT } from '@sapphire/plugin-i18next';
import { isNullishOrZero } from '@sapphire/utilities';
import { RESTJSONErrorCodes } from 'discord.js';

export class UserListener extends Listener {
	public run(entry: ModerationManager.Entry) {
		return Promise.all([this.sendMessage(entry), this.scheduleDuration(entry)]);
	}

	private async sendMessage(entry: ModerationManager.Entry) {
		const moderation = getModeration(entry.guild);
		const channel = await moderation.fetchChannel();
		if (channel === null || !canSendEmbeds(channel)) return;

		const t = await fetchT(entry.guild);
		const options = { embeds: [await getEmbed(t, entry)] };
		try {
			await resolveOnErrorCodes(channel.send(options), RESTJSONErrorCodes.MissingAccess, RESTJSONErrorCodes.MissingPermissions);
		} catch (error) {
			await writeSettings(entry.guild, { channelsLogsModeration: null });
		}
	}

	private async scheduleDuration(entry: ModerationManager.Entry) {
		if (isNullishOrZero(entry.duration)) return;

		const taskName = getUndoTaskName(entry.type);
		if (taskName === null) return;

		await this.container.schedule
			.add(taskName, entry.expiresTimestamp!, {
				catchUp: true,
				data: {
					caseID: entry.id,
					userID: entry.userId,
					guildID: entry.guild.id,
					// @ts-expect-error complex types
					type: entry.type,
					duration: entry.duration,
					extraData: entry.extraData
				}
			})
			.catch((error) => this.container.logger.fatal(error));
	}
}
