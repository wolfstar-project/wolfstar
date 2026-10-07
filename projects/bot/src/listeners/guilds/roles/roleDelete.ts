import { readSettingsPermissionNodes, writeSettingsTransaction } from '#lib/database';
import { readAutoModerationRules, updateAutoModerationRule } from '#lib/moderation/automod/rules';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Role } from '@wolfstar/plugin-gateway';
import type { GatewayGuildRoleDeleteDispatchData, Snowflake } from 'discord-api-types/v10';
import type { StickyRole, UniqueRoleSet } from 'wolfstar-database';

@RegisterAsGatewayListener('guildRoleDelete')
export class UserListener extends EventGatewayListener<'guildRoleDelete'> {
	public async run(_role: Role | null, data: GatewayGuildRoleDeleteDispatchData) {
		const guild = await this.container.gatewayClient.guilds.resolve(data.guild_id);
		if (!guild?.available) return;

		// The role may not have been cached, its ID is all that is needed:
		const roleId = data.role_id;

		using trx = await writeSettingsTransaction(guild);

		trx.write({ stickyRoles: this.#filterStickyRoles(trx.settings.stickyRoles, roleId) });
		trx.write({ rolesUniqueRoleSets: this.#filterUniqueRoleSets(trx.settings.rolesUniqueRoleSets, roleId) });

		trx.write({ rolesModerator: trx.settings.rolesModerator.filter((rm) => rm !== roleId) });
		trx.write({ rolesAdmin: trx.settings.rolesAdmin.filter((rm) => rm !== roleId) });
		trx.write({ rolesPublic: trx.settings.rolesPublic.filter((rm) => rm !== roleId) });

		// The initial roles hold several roles, unlike the single role they held before:
		trx.write({ rolesInitial: trx.settings.rolesInitial.filter((rm) => rm !== roleId) });
		trx.write({ rolesInitialHumans: trx.settings.rolesInitialHumans.filter((rm) => rm !== roleId) });
		trx.write({ rolesInitialRobots: trx.settings.rolesInitialRobots.filter((rm) => rm !== roleId) });
		if (trx.settings.rolesMuted === roleId) trx.write({ rolesMuted: null });
		if (trx.settings.rolesRestrictedReaction === roleId) trx.write({ rolesRestrictedReaction: null });
		if (trx.settings.rolesRestrictedEmbed === roleId) trx.write({ rolesRestrictedEmbed: null });
		if (trx.settings.rolesRestrictedEmoji === roleId) trx.write({ rolesRestrictedEmoji: null });
		if (trx.settings.rolesRestrictedAttachment === roleId) trx.write({ rolesRestrictedAttachment: null });
		if (trx.settings.rolesRestrictedVoice === roleId) trx.write({ rolesRestrictedVoice: null });

		const permissionNodes = readSettingsPermissionNodes(trx.settings);
		if (permissionNodes.has(roleId)) {
			trx.write({ permissionsRoles: await permissionNodes.refresh(trx.settings) });
		}

		await trx.submitWithAudit(this.container.gatewayClient.user!.id);

		// The rules that exempted the role forget it:
		for (const rule of await readAutoModerationRules(guild.id)) {
			if (!rule.ignoredRoles.includes(roleId)) continue;
			await updateAutoModerationRule(guild.id, rule.id, (current) => ({ ignoredRoles: current.ignoredRoles.filter((id) => id !== roleId) }));
		}
	}

	#filterStickyRoles(roles: readonly StickyRole[], roleId: Snowflake) {
		return roles
			.map((entry): StickyRole => ({ user: entry.user, roles: entry.roles.filter((srr) => srr !== roleId) }))
			.filter((entry) => entry.roles.length > 0);
	}

	#filterUniqueRoleSets(roles: readonly UniqueRoleSet[], roleId: Snowflake) {
		return roles
			.map((entry): UniqueRoleSet => ({ name: entry.name, roles: entry.roles.filter((urs) => urs !== roleId) }))
			.filter((entry) => entry.roles.length > 0);
	}
}
