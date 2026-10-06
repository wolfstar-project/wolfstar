import { floatPromise } from '#common';
import { readSettings } from '#lib/database';
import { isNullish } from '@sapphire/utilities';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import {
	AuditLogEvent,
	GatewayDispatchEvents,
	PermissionFlagsBits,
	type GatewayDispatchPayload,
	type GatewayGuildMemberUpdateDispatchData,
	type RESTGetAPIAuditLogResult,
	type Snowflake
} from 'discord-api-types/v10';

type GatewayData = Readonly<GatewayGuildMemberUpdateDispatchData>;

@RegisterAsGatewayListener('raw')
export class UserListener extends EventGatewayListener<'raw'> {
	private readonly requiredPermissions = PermissionFlagsBits.ViewAuditLog;

	public async run(payload: GatewayDispatchPayload) {
		if (payload.t !== GatewayDispatchEvents.GuildMemberUpdate) return;

		const data: GatewayData = payload.d;
		const { guilds, members } = this.container.gatewayClient;
		const guild = await guilds.cache.get(guilds.resolveKey(data.guild_id));

		// If the guild does not exist for some reason, skip:
		if (isNullish(guild)) return;

		// If the bot doesn't have the required permissions, skip:
		const me = await members.me(guild.id);
		if (isNullish(me) || !(await me.permissions).has(this.requiredPermissions)) return;

		floatPromise(this.handleRoleSets(guild.id, data));
	}

	private async handleRoleSets(guildId: Snowflake, data: GatewayData) {
		// Handle unique role sets
		let hasMultipleRolesInOneSet = false;
		const settings = await readSettings(guildId);
		const allRoleSets = settings.rolesUniqueRoleSets;

		// First check if the user has multiple roles from a set
		for (const set of allRoleSets) {
			let hasOneRole = false;
			for (const id of set.roles) {
				if (!data.roles.includes(id)) continue;

				if (hasOneRole) {
					hasMultipleRolesInOneSet = true;
					break;
				} else {
					hasOneRole = true;
				}
			}
			// If we already know the member has multiple roles break the loop
			if (hasMultipleRolesInOneSet) break;
		}

		// If the user does not have multiple roles from any set cancel
		if (!hasMultipleRolesInOneSet) return;

		const { api } = this.container.gatewayClient;
		const auditLogs = await api.guilds.getAuditLogs(guildId, {
			limit: 10,
			action_type: AuditLogEvent.MemberRoleUpdate
		});

		const updatedRoleId = this.getChange(auditLogs, data.user.id);
		if (updatedRoleId === null) return;

		let memberRoles = data.roles;
		for (const set of allRoleSets) {
			if (set.roles.includes(updatedRoleId)) memberRoles = memberRoles.filter((id) => !set.roles.includes(id) || id === updatedRoleId);
		}

		await api.guilds.editMember(guildId, data.user.id, { roles: memberRoles }, { reason: 'Automatic Role Set Modification' });
	}

	private getChange(results: RESTGetAPIAuditLogResult, userId: string): string | null {
		// Scan the audit logs.
		for (const result of results.audit_log_entries) {
			// If it was given by Wolf, continue.
			if (result.user_id === process.env.CLIENT_ID) continue;

			// If the target isn't the edited user, continue.
			if (result.target_id !== userId) continue;

			// If there are no changes, continue.
			if (typeof result.changes === 'undefined') continue;

			// Scan the changes.
			for (const change of result.changes) {
				if (change.key === '$add') return change.new_value![0].id;
			}
		}

		// No changes found.
		return null;
	}
}
