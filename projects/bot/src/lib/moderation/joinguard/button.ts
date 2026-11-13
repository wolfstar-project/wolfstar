import { resolveOnErrorCodes } from '#common';
import { writeSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import { joinGuardErr, joinGuardOk, type JoinGuardResult } from '#lib/moderation/joinguard/checkpoint';
import { describeJoinGuardError } from '#lib/moderation/joinguard/log';
import { getMissingJoinGuardChannelPermissions } from '#lib/moderation/joinguard/permissions';
import { renderJoinGuardCheckpointButton } from '#lib/moderation/joinguard/render';
import { announceJoinGuardChange } from '#lib/moderation/joinguard/store';
import { withSharedLock } from '#utils/locks';
import { container } from '@wolfstar/http-framework';
import { RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import { fetchTableSettings } from 'wolfstar-database';

/**
 * Where the checkpoint button of a guild is, and whether the one it had was edited rather than posted again.
 */
export interface JoinGuardButton {
	readonly channelId: Snowflake;
	readonly messageId: Snowflake;
	readonly edited: boolean;
}

/**
 * Posts the checkpoint button in the channel of `join-guard.checkpoint-channel`, or edits the one the bot posted when
 * it is still there, and remembers it in `join-guard.checkpoint-message`, which only the bot writes.
 *
 * @remarks It runs under the lock of the join guard of the guild (`joinguard:<guildId>`) and reads the settings from
 * their table, so two posts at once do not leave two buttons.
 *
 * @param guildId - The guild.
 * @param actorId - Who asked, for the audit log of the settings.
 */
export function postJoinGuardButton(guildId: Snowflake, actorId: Snowflake): Promise<JoinGuardResult<JoinGuardButton>> {
	return withSharedLock(`joinguard:${guildId}`, async () => {
		const guild = await container.gatewayClient.guilds.resolve(guildId);
		if (guild === null) return joinGuardErr('UnknownGuild', 'The bot is not in the guild.');

		const settings = await fetchTableSettings(container.prisma.orm, 'GuildJoinGuard', guildId);
		const channelId = settings.joinGuardCheckpointChannel;
		if (channelId === null) return joinGuardErr('NoChannel', 'The guild has no checkpoint channel.');

		const missing = await getMissingJoinGuardChannelPermissions(guildId, channelId);
		if (missing === null) return joinGuardErr('UnknownChannel', 'The checkpoint channel is not one of the guild anymore.');
		if (missing.length > 0) return joinGuardErr('MissingPermissions', `The bot is missing ${missing.join(', ')} in the checkpoint channel.`);

		const t = await fetchGuildT(guild);
		const body = renderJoinGuardCheckpointButton(t, guildId);
		const { api } = container.gatewayClient;
		const previous = settings.joinGuardCheckpointMessage;
		if (previous !== null) {
			// The button of another channel, or one deleted by hand, is not there to edit: a new one is posted.
			const edited = await resolveOnErrorCodes(api.channels.editMessage(channelId, previous, body), RESTJSONErrorCodes.UnknownMessage);
			if (edited !== null) return joinGuardOk({ channelId, messageId: previous, edited: true });
		}

		let messageId: Snowflake;
		try {
			messageId = (await api.channels.createMessage(channelId, body)).id;
		} catch (error) {
			return joinGuardErr('Refused', describeJoinGuardError(t, 'Checkpoint', error));
		}

		await writeSettings(guildId, { joinGuardCheckpointMessage: messageId }, actorId);
		announceJoinGuardChange(guildId);
		return joinGuardOk({ channelId, messageId, edited: false });
	});
}
