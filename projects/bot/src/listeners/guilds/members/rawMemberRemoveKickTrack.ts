import { readSettings } from '#lib/database';
import { fetchMemberRoleIds } from '#lib/moderation/common';
import { Events } from '#lib/types';
import { getLogger, getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import type { GatewayGuildMemberRemoveDispatchData } from 'discord-api-types/v10';

/**
 * Makes a kick case of a member who was kicked in Discord, instead of a plain leave, if the guild asked for it with
 * `moderation.track-kicks`.
 *
 * @remarks
 *
 * Discord does not say a member was kicked: it is the audit log that does, with its `Kick Members` entry. The entry is
 * waited for (it is given to the logger as it arrives, see `rawGuildAuditLogEntryCreateLoggerTrack`) and, when none
 * comes, looked for once, so it costs a request for each member that leaves, which is why it is a setting. A kick of the
 * bot (a command, the auto-moderation, the honeypot) makes its own case, and so does a ban, which is not a kick.
 */
@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.RawMemberRemove })
export class UserListener extends Listener {
	public async run(guild: Guild, member: GuildMember | null, { user }: GatewayGuildMemberRemoveDispatchData) {
		const settings = await readSettings(guild);
		if (!settings.moderationTrackKicks) return;

		const moderation = await getModeration(guild);
		await moderation.waitLock();

		// The member was banned or kicked by the bot a moment ago, which made its own case:
		const latest = moderation.getLatestRecentCachedEntryForUser(user.id);
		if (latest !== null && [TypeVariation.Kick, TypeVariation.Ban, TypeVariation.Softban].includes(latest.type)) return;

		const logger = await getLogger(guild);
		const context = await logger.kick.wait(user.id).catch(() => null);
		// The member left, or was banned, since the audit log has no kick for them:
		if (context === null) return;
		// The bot kicked them itself, and the action makes its own case:
		if (context.userId === process.env.CLIENT_ID) return;

		if (moderation.checkSimilarEntryHasBeenCreated(TypeVariation.Kick, user.id)) return;

		const roles = await fetchMemberRoleIds(member);
		await moderation.insert(
			moderation.create({
				user: user.id,
				moderator: context.userId,
				reason: context.reason,
				type: TypeVariation.Kick,
				extraData: roles.length === 0 ? null : roles
			})
		);
	}
}
