import { fetchGuildT } from '#lib/moderation/common';
import type { JoinGuardRoleProblem } from '#lib/moderation/joinguard/permissions';
import { renderJoinGuardLog, type JoinGuardLogEntry } from '#lib/moderation/joinguard/render';
import { Events } from '#lib/types/Enums';
import type { LogMessageOptions } from '#utils/functions';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import type { Snowflake } from 'discord-api-types/v10';
import { recordJoinGuardSharedBan, type JoinGuardSharedBanSource } from 'wolfstar-database';

const Root = 'events/join-guard';

/**
 * What the guard tried to do, as its errors name it.
 */
export type JoinGuardErrorAction = 'Ban' | 'Kick' | 'Checkpoint' | 'Roles' | 'Timeout';

/**
 * Sends a log of the join guard to the channel of `join-guard.log-channel`, when the guild has one. The channel is
 * forgotten when it is gone, as the other logs do.
 *
 * @param guild - The guild.
 * @param logChannelId - The channel of the logs of the guard.
 * @param user - Who the log is about.
 * @param entry - What it tells.
 */
export function sendJoinGuardLog(guild: Guild, logChannelId: Snowflake | null, user: LogMessageOptions['author'], entry: JoinGuardLogEntry) {
	if (logChannelId === null) return;

	container.client.emit(Events.GuildMessageLog, guild, logChannelId, 'joinGuardLogChannel', async () =>
		renderJoinGuardLog(await fetchGuildT(guild), user, entry)
	);
}

/**
 * Describes an action Discord refused or that failed, for the log: Discord's reason is what the moderators can fix,
 * anything else is logged and only said to have failed.
 *
 * @param t - The function to translate with, in the language of the guild.
 * @param action - What the guard tried to do.
 * @param error - What it threw.
 */
export function describeJoinGuardError(t: TFunction<AnyNamespace>, action: JoinGuardErrorAction, error: unknown): string {
	const name = t(`${Root}:action${action}`);
	if (error instanceof DiscordAPIError) return t(`${Root}:errorRefused`, { action: name, error: error.message });

	container.logger.error(`[JoinGuard] Could not ${action.toLowerCase()}:`, error);
	return t(`${Root}:errorFailed`, { action: name });
}

/**
 * Describes the permissions the bot is missing for an action, for the log.
 */
export function describeJoinGuardMissingPermissions(t: TFunction<AnyNamespace>, action: JoinGuardErrorAction, missing: readonly string[]) {
	return t(`${Root}:errorMissingPermissions`, { action: t(`${Root}:action${action}`), missing });
}

/**
 * Describes why the bot cannot give or take a role, for the log.
 */
export function describeJoinGuardRoleProblem(t: TFunction<AnyNamespace>, problem: JoinGuardRoleProblem) {
	switch (problem) {
		case 'unknown':
			return t(`${Root}:roleProblemUnknown`);
		case 'everyone':
			return t(`${Root}:roleProblemEveryone`);
		case 'managed':
			return t(`${Root}:roleProblemManaged`);
		case 'missingPermission':
			return t(`${Root}:roleProblemMissingPermission`);
		case 'above':
			return t(`${Root}:roleProblemAbove`);
	}
}

/**
 * Records an account banned for raiding or scamming on the shared ban list, which the checkpoint of every guild reads.
 *
 * @remarks It never throws: the ban is made, and an account missing from the list only lets it pass the checkpoint of
 * another guild, which the failure logged here tells.
 *
 * @param data - Who was banned, where, by which case and by what.
 */
export async function recordSharedBan(data: { guildId: Snowflake; userId: Snowflake; caseId: number; source: JoinGuardSharedBanSource }) {
	try {
		await recordJoinGuardSharedBan(container.prisma, data);
	} catch (error) {
		container.logger.error(`[JoinGuard] Could not record the ban of case ${data.caseId} of ${data.guildId} on the shared ban list:`, error);
	}
}
