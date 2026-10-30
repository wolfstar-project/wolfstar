import { writeSettingsTransaction } from '#lib/database';
import { convertLegacyNodes, type LegacyNodeConversion } from '#lib/structures/commands-menu/conversion';
import { readCommandRestrictions, writeCommandRestrictions } from '#lib/structures/commands-menu/restrictions';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import { isAccessEntry } from 'wolfstar-database';

/**
 * Converts the legacy permission nodes of a guild into command rules, see `convertLegacyNodes`: the rules and the two
 * columns of the nodes are written together, under the lock of the settings, read again from the database, and
 * audited in the name of `actorId`. Running it again changes nothing.
 *
 * @param guildId - The guild.
 * @param actorId - Who the change is audited for, the bot.
 * @returns What was converted, `null` when nothing changed.
 */
export async function convertGuildCommandRules(guildId: Snowflake, actorId: Snowflake): Promise<LegacyNodeConversion | null> {
	using trx = await writeSettingsTransaction(guildId);
	const { settings } = trx;
	const hasNodes = [...settings.permissionsUsers, ...settings.permissionsRoles].some((entry) => !isAccessEntry(entry));
	if (!hasNodes) return null;

	const roles = await container.gatewayClient.roles.fetchAll(guildId);
	const restrictions = readCommandRestrictions(settings.commandsRestrictions, guildId);
	const result = convertLegacyNodes({
		users: settings.permissionsUsers,
		roles: settings.permissionsRoles,
		restrictions,
		existingRoleIds: new Set(roles.map((role) => role.id))
	});

	const unchanged =
		result.users.length === settings.permissionsUsers.length &&
		result.roles.length === settings.permissionsRoles.length &&
		result.converted.allow + result.converted.deny === 0;
	if (unchanged) return null;

	await trx
		.write({
			commandsRestrictions: writeCommandRestrictions(result.restrictions) as never,
			permissionsUsers: result.users,
			permissionsRoles: result.roles
		})
		.submitWithAudit(actorId);
	return result;
}
