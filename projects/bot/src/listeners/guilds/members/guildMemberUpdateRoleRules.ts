import { getRoleRuleChanges, readRoleRules } from '#lib/roles/rules';
import { fetchGuildT } from '#lib/moderation/common/util';
import { getLogPrefix } from '#utils/functions';
import { toErrorCodeResult } from '#common';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';
import { PermissionFlagsBits, RESTJSONErrorCodes } from 'discord-api-types/v10';

/**
 * Keeps the roles of the role rules (`/role-rules`) in sync with the other roles of a member: a rule's role is given
 * when the member meets it and taken when they no longer do, in one edit of the member.
 *
 * @remarks
 *
 * The edit is itself a change of the roles, which comes back here and finds nothing to do, since the rules never read
 * a role another rule gives (`checkRoleRule`). A role the bot cannot manage (above its own, or managed by an
 * integration) is left as it is.
 */
@RegisterAsDispatchListener('guildMemberUpdate')
export class UserListener extends EventGatewayListener<'guildMemberUpdate'> {
	public async run(previous: GuildMember | null, next: GuildMember) {
		// Only a change of the roles can change what the rules say, the other updates of a member cost nothing:
		if (previous !== null && !previous.partial && sameRoles(previous.roleIds, next.roleIds)) return;

		const rules = await readRoleRules(next.guildId);
		if (rules.length === 0) return;

		const roleIds = new Set(next.roleIds);
		const { add, remove } = getRoleRuleChanges(rules, roleIds);
		if (add.length === 0 && remove.length === 0) return;

		const { gatewayClient } = this.container;
		const me = await gatewayClient.members.fetchMe(next.guildId);
		await me.roles.fetch();
		if (!(await me.permissions).has(PermissionFlagsBits.ManageRoles)) return;

		const position = (await me.roles.highest)?.position ?? 0;
		const roles = new Map((await gatewayClient.roles.fetchAll(next.guildId)).map((role) => [role.id, role]));
		const manageable = (roleId: string) => {
			const role = roles.get(roleId);
			return role !== undefined && !role.managed && role.position < position;
		};

		const toAdd = add.filter(manageable);
		const toRemove = new Set(remove.filter(manageable));
		if (toAdd.length === 0 && toRemove.size === 0) return;

		const user = next.user ?? (await next.fetchUser());
		const t = await fetchGuildT({ id: next.guildId });
		const result = await toErrorCodeResult(
			gatewayClient.api.guilds.editMember(
				next.guildId,
				user.id,
				{ roles: [...next.roleIds.filter((roleId) => !toRemove.has(roleId)), ...toAdd] },
				{ reason: t('moderationActions:roleRuleReason') }
			)
		);
		result.inspectErr((code) => {
			// The member left meanwhile:
			if (code === RESTJSONErrorCodes.UnknownMember) return;
			this.container.logger.error(`${getLogPrefix(this)} Could not apply the role rules to a member (${code}).`);
		});
	}
}

function sameRoles(a: readonly string[], b: readonly string[]) {
	if (a.length !== b.length) return false;
	const set = new Set(a);
	return b.every((roleId) => set.has(roleId));
}
