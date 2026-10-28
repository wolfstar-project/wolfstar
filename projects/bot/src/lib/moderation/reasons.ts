import { GuildCache } from '#utils/guildCache';
import { broadcastShardMessage, onShardMessage } from '#lib/sharder/messages';
import { container } from '@wolfstar/http-framework';
import type { Command } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import {
	deleteModerationReason,
	fetchModerationReasons,
	MaximumModerationReasons,
	setModerationReason,
	type ModerationReason
} from 'wolfstar-database';

/**
 * The predefined reasons of each guild, which every moderation command and its autocomplete read.
 */
const cache = new GuildCache<readonly ModerationReason[]>((guildId) => fetchModerationReasons(container.prisma, guildId));

/**
 * Thrown when a guild already has the most predefined reasons it can have.
 */
export class ModerationReasonLimitError extends Error {
	public constructor(public readonly maximum: number) {
		super(`Predefined reason limit reached: ${maximum}`);
	}
}

/**
 * Reads the predefined reasons of a guild, from the cache after the first time.
 *
 * @param guildId - The ID of the guild.
 */
export function readModerationReasons(guildId: Snowflake): Promise<readonly ModerationReason[]> {
	return cache.read(guildId);
}

// The reasons are cached by every shard process, so a change in one of them makes the copies of the others stale.
onShardMessage('moderationReasonsUpdate', ({ guildId }) => cache.forget(guildId));
onShardMessage('settingsInvalidateAll', () => cache.forgetAll());

function changed(guildId: Snowflake) {
	cache.forget(guildId);
	broadcastShardMessage({ type: 'moderationReasonsUpdate', guildId });
}

/**
 * Normalizes an alias, which is matched whatever its case and its spaces.
 */
export function normalizeModerationReasonAlias(alias: string): string {
	return alias.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Finds the reason an alias stands for.
 *
 * @param reasons - The predefined reasons of the guild.
 * @param input - What was written in the `reason` option.
 * @returns The predefined reason when the input is one of its aliases, the input otherwise.
 */
export function resolveModerationReasonAlias(reasons: readonly ModerationReason[], input: string): string {
	const alias = normalizeModerationReasonAlias(input);
	return reasons.find((entry) => entry.alias === alias)?.reason ?? input;
}

/**
 * Resolves the `reason` option of a moderation command, an alias being replaced by its predefined reason.
 *
 * @param guildId - The ID of the guild.
 * @param input - What was written, `null` when the option was left out.
 */
export async function resolveModerationReason(guildId: Snowflake, input: string | null): Promise<string | null> {
	if (input === null || input.trim() === '') return input;
	return resolveModerationReasonAlias(await readModerationReasons(guildId), input);
}

/**
 * The choices the autocomplete of a `reason` option offers: the predefined reasons whose alias or text has what is
 * being written, each written in the option by its alias.
 *
 * @param reasons - The predefined reasons of the guild.
 * @param query - What is being written.
 */
export function getModerationReasonChoices(reasons: readonly ModerationReason[], query: string): { name: string; value: string }[] {
	const lowered = query.trim().toLowerCase();
	return reasons
		.filter((entry) => lowered === '' || entry.alias.includes(lowered) || entry.reason.toLowerCase().includes(lowered))
		.slice(0, 25)
		.map((entry) => {
			const name = `${entry.alias} — ${entry.reason}`;
			return { name: name.length > 100 ? `${name.slice(0, 99)}…` : name, value: entry.alias };
		});
}

/**
 * Sets a predefined reason, which replaces the one with the same alias.
 *
 * @returns Whether it was new.
 * @throws {@linkcode ModerationReasonLimitError} When the guild has the most reasons it can have and this is one more.
 */
export async function addModerationReason(guildId: Snowflake, data: ModerationReason): Promise<boolean> {
	const alias = normalizeModerationReasonAlias(data.alias);
	const existing = await fetchModerationReasons(container.prisma, guildId);
	if (existing.length >= MaximumModerationReasons && !existing.some((entry) => entry.alias === alias)) {
		throw new ModerationReasonLimitError(MaximumModerationReasons);
	}

	const created = await setModerationReason(container.prisma, guildId, { alias, reason: data.reason.trim() });
	changed(guildId);
	return created;
}

/**
 * Removes a predefined reason.
 *
 * @returns Whether the guild had it.
 */
export async function removeModerationReason(guildId: Snowflake, alias: string): Promise<boolean> {
	const deleted = await deleteModerationReason(container.prisma, guildId, normalizeModerationReasonAlias(alias));
	if (deleted) changed(guildId);
	return deleted;
}

/**
 * Answers the autocomplete of the `reason` option of a moderation command with the predefined reasons of the guild.
 *
 * @remarks The autocomplete of a subcommand reaches its parent, so the parents of the moderation subcommands call this
 * as the moderation commands do. Any other focused option is answered with nothing.
 *
 * @param interaction - The autocomplete interaction.
 * @param args - Its arguments, of which `focused` and `reason` are read.
 */
export async function replyModerationReasonAutocomplete(interaction: Command.AutocompleteInteraction, args: object) {
	const { focused, reason } = args as { focused?: unknown; reason?: unknown };
	if (focused !== 'reason' || !interaction.guildId) return interaction.replyEmpty();

	const reasons = await readModerationReasons(interaction.guildId);
	return interaction.reply({ choices: getModerationReasonChoices(reasons, typeof reason === 'string' ? reason : '') });
}
