import { resolveOnErrorCodes } from '#common';
import { getUsersInCourse } from '#lib/moderation/common/roleChanges';
import { fetchGuildT } from '#lib/moderation/common/util';
import { isKnownNotVoiceMuted, markNotVoiceMuted, shouldRestoreVoiceMute } from '#lib/moderation/common/voiceMutes';
import { getLogPrefix, getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { isNullish } from '@sapphire/utilities';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { VoiceState } from '@wolfstar/plugin-gateway';
import { PermissionFlagsBits, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';

/**
 * Applies a voice mute again when the member it is in course for comes back to a voice channel without it.
 *
 * @remarks
 *
 * The server mute of a member does not survive leaving the server: who was voice muted left, joined again and could
 * talk, with the case still in course. Discord only mutes a member who is connected to a voice channel, so the mute is
 * given back when they connect to one and not when they join the server.
 *
 * It is the same voice mute: the member is muted with the API and no case is made. It stops with the case, since the
 * cases are what is asked: `/vmute remove` and the end of a temporary voice mute both leave an undo as the latest case.
 *
 * This runs for every voice state update of every server, so the cases are only read for a member who came into a
 * channel and is not muted, and who was not found to have no voice mute a moment ago (`markNotVoiceMuted`).
 */
@RegisterAsGatewayListener('voiceStateUpdate')
export class UserListener extends EventGatewayListener<'voiceStateUpdate'> {
	public async run(previous: VoiceState | null, next: VoiceState) {
		const { guildId, userId } = next;
		if (isNullish(guildId)) return;
		if (!shouldRestoreVoiceMute(previous, next, next.member?.user?.bot === true)) return;

		try {
			await this.handle(guildId, userId);
		} catch (error) {
			this.container.logger.error(getLogPrefix(this), 'Could not apply a voice mute again:', error);
		}
	}

	private async handle(guildId: Snowflake, userId: Snowflake) {
		if (await isKnownNotVoiceMuted(guildId, userId)) return;
		// Without the permission the member is not remembered either: the mute is given back once the bot has it.
		if (!(await this.canMute(guildId))) return;

		const guild = await this.container.gatewayClient.guilds.fetch(guildId);
		const moderation = await getModeration(guild);
		const entries = await moderation.fetch({ userId });
		if (!getUsersInCourse(entries.values(), TypeVariation.VoiceMute).includes(userId)) {
			await markNotVoiceMuted(guildId, userId);
			return;
		}

		const t = await fetchGuildT(guild);
		const reason = t('moderationActions:voiceMuteRestored');
		// The member may have left the channel, or the server, since the update:
		await resolveOnErrorCodes(
			this.container.gatewayClient.api.guilds.editMember(guildId, userId, { mute: true }, { reason }),
			RESTJSONErrorCodes.TargetUserIsNotConnectedToVoice,
			RESTJSONErrorCodes.UnknownMember
		);
	}

	private async canMute(guildId: Snowflake) {
		// The roles of the bot are fetched, the getter skips the ones the cache lacks and may answer fewer permissions:
		const me = await this.container.gatewayClient.members.fetchMe(guildId);
		const permissions = await me.fetchPermissions();
		return permissions.has(PermissionFlagsBits.MuteMembers);
	}
}
