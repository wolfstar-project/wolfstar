import { resolveOnErrorCodes } from '#common';
import { fromModerationRow } from '#lib/moderation/managers/ModerationRecord';
import { isCaseInCourse, scheduleUndoTask } from '#lib/moderation/common/undoTasks';
import { convertGuildCommandRules } from '#lib/structures/commands-menu/convertGuild';
import { container } from '@wolfstar/http-framework';
import { RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import { fetchModerationCasesData } from 'wolfstar-database';

/**
 * Does for a guild the conversion imported what needs the loaded commands, Discord or the queue: turns its legacy
 * permission nodes into command rules and schedules the jobs that undo its temporary cases. Running it again changes
 * nothing: a job has the ID of its case.
 *
 * @param guildId - The guild.
 * @param actorId - Who the change of the settings is audited for, the bot.
 */
export async function followUpLegacyGuild(guildId: Snowflake, actorId: Snowflake) {
	const { orm } = container.prisma;
	const id = BigInt(guildId);

	const permissions = await orm.public.GuildPermissions.where({ id }).first();
	if (permissions && permissions.users.length + permissions.roles.length > 0) {
		// Discord refuses a guild the bot left, which would otherwise stay pending and fail at every start:
		await resolveOnErrorCodes(convertGuildCommandRules(guildId, actorId), RESTJSONErrorCodes.MissingAccess, RESTJSONErrorCodes.UnknownGuild);
	}

	const rows = await orm.public.ModerationAction.where({ guildId: id }).all();
	const cases = rows.map(fromModerationRow).filter((entry) => entry.duration !== null && isCaseInCourse(entry.metadata));
	if (cases.length === 0) return;

	const data = await fetchModerationCasesData(orm, guildId);
	for (const entry of cases) {
		await scheduleUndoTask({
			type: entry.type,
			id: entry.id,
			userId: entry.userId,
			guildId,
			duration: entry.duration!,
			extraData: data.get(entry.id)?.extraData ?? null,
			expiresAt: entry.createdAt + entry.duration!
		});
	}
}
