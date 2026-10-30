import { retryWithDelays } from '#common';
import { seconds } from 'wolfstar-shared';
import { readSettings, readSettingsPermissionNodes, writeSettingsTransaction } from '#lib/database';
import { RoleActions } from '#lib/moderation/actions';
import { readCommandRestrictions, removeFromCommandRestrictions, writeCommandRestrictions } from '#lib/structures/commands-menu/restrictions';
import type { RoleModerationAction } from '#lib/moderation/actions/base/RoleModerationAction';
import { readAutoModerationRules, updateAutoModerationRule } from '#lib/moderation/automod/rules';
import { announceJoinGuardChange } from '#lib/moderation/joinguard/store';
import { getLogPrefix } from '#utils/functions';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { Guild, Role } from '@wolfstar/plugin-gateway';
import type { GatewayGuildRoleDeleteDispatchData, Snowflake } from 'discord-api-types/v10';
import { clearJoinGuardRuleRole, type StickyRole, type UniqueRoleSet } from 'wolfstar-database';

/**
 * How long to wait before the role of an action is made again after it could not be, once for each attempt but the first.
 */
const RestoreRetryDelays = [seconds(5), seconds(30)];

@RegisterAsDispatchListener('guildRoleDelete')
export class UserListener extends EventGatewayListener<'guildRoleDelete'> {
	public async run(_role: Role | null, data: GatewayGuildRoleDeleteDispatchData) {
		const guild = await this.container.gatewayClient.guilds.resolve(data.guild_id);
		if (!guild?.available) return;

		// The role may not have been cached, its ID is all that is needed:
		const roleId = data.role_id;

		// The actions whose role this was, read before the settings forget it:
		const settings = await readSettings(guild);
		const actions = RoleActions.filter((action) => settings[action.roleKey] === roleId);

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
		if (trx.settings.reportsRole === roleId) trx.write({ reportsRole: null });
		if (trx.settings.joinGuardPendingRole === roleId) trx.write({ joinGuardPendingRole: null });
		if (trx.settings.joinGuardVerifiedRole === roleId) trx.write({ joinGuardVerifiedRole: null });
		trx.write({ joinGuardAllowedRoles: trx.settings.joinGuardAllowedRoles.filter((allowed) => allowed !== roleId) });

		// The commands that were restricted to the role, or that ignored it, forget it:
		const restrictions = removeFromCommandRestrictions(readCommandRestrictions(trx.settings.commandsRestrictions, guild.id), roleId);
		if (restrictions !== null) trx.write({ commandsRestrictions: writeCommandRestrictions(restrictions) as never });

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

		for (const action of actions) await this.#restoreActionRole(action, guild);

		await this.#forgetJoinGuardRole(guild.id, roleId);
	}

	/**
	 * Makes the role of a mute, or of a restriction, again when it was deleted while the action is in course for
	 * somebody. It is tried three times, since what stops the bot may pass (Discord fails, a moderator gives the bot the
	 * permission it lacks). After that it is logged, and the action is left with no role: the settings forgot the one
	 * that was deleted before any of this, so they never show a role that is not there.
	 */
	async #restoreActionRole(action: RoleModerationAction, guild: Guild) {
		try {
			const restored = await retryWithDelays(() => action.restore(guild), RestoreRetryDelays);
			if (restored === null) return;

			this.container.logger.info(
				getLogPrefix(this),
				`Made the role of an action again in ${guild.id}, as ${restored.role.id}, and gave it to ${restored.members} members.`
			);
		} catch (error) {
			this.container.logger.error(
				getLogPrefix(this),
				'Could not make the role of an action again after it was deleted, in three attempts:',
				error
			);
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

	/**
	 * The rules of the join guard that gave the role forget it. It is one update, which most guilds match no row of, and
	 * the other processes are only told when a rule changed.
	 */
	async #forgetJoinGuardRole(guildId: Snowflake, roleId: Snowflake) {
		try {
			if ((await clearJoinGuardRuleRole(this.container.prisma, guildId, roleId)) > 0) announceJoinGuardChange(guildId);
		} catch (error) {
			this.container.logger.error(
				`${getLogPrefix(this)} Could not remove the deleted role ${roleId} from the join guard rules of ${guildId}:`,
				error
			);
		}
	}
}
