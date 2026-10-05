import { toErrorCodeResult } from '#common';
import { readSettings, writeSettings, type GuildSettingsOfType } from '#lib/database';
import { Events } from '#lib/types';
import { getCodeStyle, getLogPrefix } from '#utils/functions';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { GuildMember } from '@wolfstar/plugin-gateway';
import { PermissionFlagsBits, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';

@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.NotMutedMemberAdd })
export class UserListener extends Listener {
	public async run(member: GuildMember) {
		// If the bot cannot manage roles, do not proceed:
		if (!(await this.canGiveRoles(member))) return;

		const user = member.user ?? (await member.fetchUser());
		const settings = await readSettings(member);
		const initial = settings.rolesInitial;
		const initialHumans = settings.rolesInitialHumans;
		const initialRobots = settings.rolesInitialRobots;

		// The settings hold a list of roles each, `rolesInitial` takes precedence over the other two when it is set:
		const key: GuildSettingsOfType<Snowflake[]> =
			initial.length > 0 //
				? 'rolesInitial'
				: user.bot
					? 'rolesInitialRobots'
					: 'rolesInitialHumans';
		const roleIds = key === 'rolesInitial' ? initial : key === 'rolesInitialRobots' ? initialRobots : initialHumans;
		if (roleIds.length === 0) return;

		const invalid = new Set<Snowflake>();
		for (const roleId of roleIds) {
			const result = await toErrorCodeResult(this.container.gatewayClient.members.addRole(member.guildId, user.id, roleId));
			// If the role was not found or the bot can't give the role, remove it from the settings:
			if (result.isErrAnd((code) => code === RESTJSONErrorCodes.UnknownRole || code === RESTJSONErrorCodes.MissingPermissions)) {
				invalid.add(roleId);
				continue;
			}

			// In any other case, log the error as unexpected:
			result.inspectErr((code) => this.container.logger.error(`${getLogPrefix(this)} Failed to give role: ${getCodeStyle(code)}`));
		}

		if (invalid.size === 0) return;
		await writeSettings(
			member,
			(current) => ({ [key]: current[key].filter((roleId) => !invalid.has(roleId)) }),
			this.container.gatewayClient.user!.id
		);
	}

	private async canGiveRoles(member: GuildMember) {
		const me = await this.container.gatewayClient.members.me(member.guildId);
		if (!me) return false;

		const permissions = await me.fetchPermissions();
		return permissions.has(PermissionFlagsBits.ManageRoles);
	}
}
