import { writeSettings } from '#lib/database';
import type { ModerationManager } from '#lib/moderation';
import { fetchGuildT, getEmbed } from '#lib/moderation/common';
import { scheduleUndoTask } from '#lib/moderation/common/undoTasks';
import { resolveOnErrorCodes } from '#common';
import { getModeration } from '#utils/functions';
import { isNullishOrZero } from '@sapphire/utilities';
import { Listener } from '@wolfstar/http-framework';
import { canSendEmbeds } from '@wolfstar/http-framework-utilities/gateway';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';

export class UserListener extends Listener {
	public run(entry: ModerationManager.Entry) {
		return Promise.all([this.sendMessage(entry), this.scheduleDuration(entry)]);
	}

	private async sendMessage(entry: ModerationManager.Entry) {
		const moderation = await getModeration(entry.guild);
		const channel = await moderation.fetchChannel();
		if (channel === null || !(await canSendEmbeds(channel))) return;

		const t = await fetchGuildT(entry.guild);
		// The case replies to the copy of its message that was forwarded before the action, see `forwardCaseMessage`:
		const forwardedId = entry.messageReference?.forwardedId;
		const options = {
			embeds: [(await getEmbed(t, entry)).toJSON()],
			...(forwardedId && { message_reference: { message_id: forwardedId, fail_if_not_exists: false } })
		};
		try {
			await resolveOnErrorCodes(channel.send(options), RESTJSONErrorCodes.MissingAccess, RESTJSONErrorCodes.MissingPermissions);
		} catch {
			await writeSettings(entry.guild, { moderationChannel: null }, this.container.gatewayClient.user!.id);
		}
	}

	private async scheduleDuration(entry: ModerationManager.Entry) {
		if (isNullishOrZero(entry.duration)) return;

		await scheduleUndoTask({
			type: entry.type,
			id: entry.id,
			userId: entry.userId,
			guildId: entry.guild.id,
			duration: entry.duration!,
			extraData: entry.extraData,
			expiresAt: entry.expiresTimestamp!
		}).catch((error) => this.container.logger.fatal(error));
	}
}
