import { readSettings } from '#lib/database';
import { RoleActions } from '#lib/moderation/actions';
import type { RoleModerationAction } from '#lib/moderation/actions/base/RoleModerationAction';
import { fetchRoleChangeExecutor, isRoleActionInCourse } from '#lib/moderation/common/manualRoles';
import { getAddedRoles, takeOwnRoleChange } from '#lib/moderation/common/roleChanges';
import { fetchGuildT } from '#lib/moderation/common/util';
import { getLogPrefix } from '#utils/functions';
import { isNullish } from '@sapphire/utilities';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * Makes a case of a mute, or of a restriction, when its role is given to a member by hand, if the guild asked for it
 * with `moderation.track-roles`.
 *
 * @remarks
 *
 * It is the other half of `guildMemberUpdateActionRoleRemoved`: the action is applied as the command does it (a mute
 * takes the other roles of the member and keeps them in its case, a restriction only makes the case), in the name of
 * who gave the role when the audit log says it. A role the bot gave itself is not taken for one, see
 * `markOwnRoleChange`, and neither is a role of a member the action is already in course for, which is the case of a
 * sticky role that is given back when the member joins again.
 *
 * Nothing is sent to the member: the roles are not given by a command, so there is no answer to carry their
 * preference of direct messages through.
 */
@RegisterAsDispatchListener('guildMemberUpdate')
export class UserListener extends EventGatewayListener<'guildMemberUpdate'> {
	public async run(previous: GuildMember | null, next: GuildMember) {
		// The roles a member had are only known when it was cached:
		if (isNullish(previous) || previous.partial) return;

		const added = getAddedRoles(previous.roleIds, next.roleIds);
		if (added.length === 0) return;

		const { guildId } = next;
		const settings = await readSettings(guildId);
		if (!settings.moderationTrackRoles) return;

		const user = next.user ?? (await next.fetchUser());
		for (const action of RoleActions) {
			const roleId = settings[action.roleKey];
			if (isNullish(roleId) || !added.includes(roleId)) continue;

			this.container.logger.debug(`[MODERATION] The role ${roleId} of ${action.roleKey} was given to a member of ${guildId}`);
			try {
				await this.handle(action, guildId, user.id, roleId);
			} catch (error) {
				this.container.logger.error(getLogPrefix(this), 'Could not apply the action of a role that was given by hand:', error);
			}
		}
	}

	private async handle(action: RoleModerationAction, guildId: Snowflake, userId: Snowflake, roleId: Snowflake) {
		// The bot gave the role itself, to apply the action:
		if (await takeOwnRoleChange(guildId, userId, roleId, 'add')) return;

		const guild = await this.container.gatewayClient.guilds.fetch(guildId);
		if (await isRoleActionInCourse(action, guild, userId)) return;

		const executor = await fetchRoleChangeExecutor(guild, userId, roleId, 'add');
		// The audit log says the bot gave it, the mark was just not there anymore:
		if (executor?.userId === process.env.CLIENT_ID) return;

		const t = await fetchGuildT(guild);
		const reason = executor?.reason ?? t('moderationActions:roleAddedManually');
		const moderator = executor ? await this.container.gatewayClient.users.fetch(executor.userId) : undefined;
		await action.apply(guild, { user: userId, moderator, reason });
		// The action marked the role as one it gives, and Discord had nothing to change since the member has it:
		await takeOwnRoleChange(guildId, userId, roleId, 'add');
	}
}
