import { resolveOnErrorCodes } from '#common';
import { getMissingHoneypotPermissions } from '#lib/moderation/honeypot/channel';
import { translateKey, type TranslationKey } from '#lib/structures/commands/utils';
import type { TFunction } from '@wolfstar/plugin-i18next';
import { container } from '@wolfstar/http-framework';
import { PermissionFlagsBits, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import type { HoneypotAction } from 'wolfstar-database';

/**
 * What keeps a honeypot from catching what it should, told to the administrator who sets it up, as the honeypot bot of
 * RiskyMH tells it:
 *
 * - `everyoneCannotView`, `everyoneCannotSend`: `@everyone` cannot see the channel, or write in it, so the bots cannot
 *   either and nobody is caught.
 * - `everyoneCannotAttach`: `@everyone` cannot attach files in it, and many spam bots post an image.
 * - `botCannotAct`: the bot lacks what the action needs in the channel or in the guild.
 * - `bigRoleAboveBot`: a role most of the members hold is above the highest role of the bot, which cannot act on them.
 */
export type HoneypotProblem = 'everyoneCannotView' | 'everyoneCannotSend' | 'everyoneCannotAttach' | 'botCannotAct' | 'bigRoleAboveBot';

/**
 * The share of the members a role has to hold for the honeypot to be of little use when it is above the bot.
 */
const BigRoleShare = 0.65;

/**
 * The fewest members a guild has for its roles to be looked at: in a small one a role above the bot is a staff role.
 */
export const BigRoleMinimumMembers = 50;

export interface HoneypotProblemInput {
	/** The permissions `@everyone` has in the honeypot channel. */
	everyonePermissions: bigint;
	/** Whether the bot has what the action needs. */
	botCanAct: boolean;
	/** The position of the highest role of the bot. */
	botPosition: number;
	/** How many members the guild has, `null` when it is not known. */
	memberCount: number | null;
	/** The roles of the guild with how many members hold each, the ones whose count is known. */
	roles: readonly { id: Snowflake; position: number; members: number }[];
}

/**
 * Finds what keeps a honeypot from working, see {@linkcode HoneypotProblem}. A pure function.
 */
export function findHoneypotProblems(input: HoneypotProblemInput): HoneypotProblem[] {
	const problems: HoneypotProblem[] = [];
	const has = (bit: bigint) => (input.everyonePermissions & (bit | PermissionFlagsBits.Administrator)) !== 0n;
	if (!has(PermissionFlagsBits.ViewChannel)) problems.push('everyoneCannotView');
	else if (!has(PermissionFlagsBits.SendMessages)) problems.push('everyoneCannotSend');
	else if (!has(PermissionFlagsBits.AttachFiles)) problems.push('everyoneCannotAttach');

	if (!input.botCanAct) problems.push('botCannotAct');

	if (input.memberCount !== null && input.memberCount >= BigRoleMinimumMembers) {
		const threshold = input.memberCount * BigRoleShare;
		if (input.roles.some((role) => role.position >= input.botPosition && role.members >= threshold)) problems.push('bigRoleAboveBot');
	}

	return problems;
}

/**
 * Looks at the honeypot of a guild as it is set up and finds its problems, see {@linkcode findHoneypotProblems}. What
 * cannot be read (the counts of the roles, which Discord gives for the guilds it can) is left out of the checks.
 *
 * @param guildId - The guild.
 * @param channelId - The honeypot channel.
 * @param action - What the honeypot does to who writes there.
 */
export async function detectHoneypotProblems(guildId: Snowflake, channelId: Snowflake, action: HoneypotAction): Promise<HoneypotProblem[]> {
	const { gatewayClient, rest } = container;
	const channel = await resolveOnErrorCodes(gatewayClient.channels.fetch(channelId), RESTJSONErrorCodes.UnknownChannel);
	if (channel === null || !('permissionsFor' in channel)) return [];

	const [everyone, missing, roles, me, guild, counts] = await Promise.all([
		(channel as { permissionsFor(id: Snowflake): Promise<{ bitField: bigint }> }).permissionsFor(guildId),
		getMissingHoneypotPermissions(guildId, channelId, action),
		gatewayClient.roles.fetchAll(guildId),
		gatewayClient.members.fetchMe(guildId),
		gatewayClient.guilds.fetch(guildId).catch(() => null),
		// The counts of the roles are a newer endpoint, which not every guild answers:
		(rest.get(`/guilds/${guildId}/roles/member-counts`) as Promise<Record<Snowflake, number>>).catch(() => ({}) as Record<Snowflake, number>)
	]);

	const byId = new Map(roles.map((role) => [role.id, role]));
	const botPosition = Math.max(0, ...me.roleIds.map((id) => byId.get(id)?.position ?? 0));
	const memberCount = guild === null ? null : ((guild as { memberCount?: number | null }).memberCount ?? null);
	return findHoneypotProblems({
		everyonePermissions: everyone.bitField,
		botCanAct: missing !== null && missing.length === 0,
		botPosition,
		memberCount,
		roles: Object.entries(counts)
			// `@everyone` is every member, and is below every role:
			.filter(([id]) => id !== guildId && byId.has(id))
			.map(([id, members]) => ({ id, position: byId.get(id)!.position, members }))
	});
}

/**
 * The lines that tell the problems to the administrator, empty when there is none.
 */
export function renderHoneypotProblems(t: TFunction, problems: readonly HoneypotProblem[]): string[] {
	if (problems.length === 0) return [];
	return [translateKey(t, 'commands/honeypot:problemsTitle'), ...problems.map((problem) => `- ${translateKey(t, ProblemKeys[problem])}`)];
}

const ProblemKeys = {
	everyoneCannotView: 'commands/honeypot:problemEveryoneCannotView',
	everyoneCannotSend: 'commands/honeypot:problemEveryoneCannotSend',
	everyoneCannotAttach: 'commands/honeypot:problemEveryoneCannotAttach',
	botCannotAct: 'commands/honeypot:problemBotCannotAct',
	bigRoleAboveBot: 'commands/honeypot:problemBigRoleAboveBot'
} as const satisfies Record<HoneypotProblem, TranslationKey>;
