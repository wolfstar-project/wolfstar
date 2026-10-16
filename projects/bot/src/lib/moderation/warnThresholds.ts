import { ModerationActions } from '#lib/moderation/actions';
import { fetchGuildT } from '#lib/moderation/common/util';
import { broadcastShardMessage, onShardMessage } from '#lib/sharder/messages';
import { getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { seconds } from '#common';
import { Collection } from '@discordjs/collection';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';
import type { Snowflake } from 'discord-api-types/v10';
import { deleteWarnThreshold, fetchWarnThresholds, MaximumWarnThresholds, setWarnThreshold, type WarnThreshold } from 'wolfstar-database';

/**
 * The thresholds of warnings of each guild, which every warning that is added is checked against.
 */
const cache = new Collection<Snowflake, readonly WarnThreshold[]>();

/**
 * Thrown when a guild already has the most thresholds it can have.
 */
export class WarnThresholdLimitError extends Error {
	public constructor(public readonly maximum: number) {
		super(`Warn threshold limit reached: ${maximum}`);
	}
}

/**
 * Reads the thresholds of warnings of a guild, from the cache after the first time.
 */
export async function readWarnThresholds(guildId: Snowflake): Promise<readonly WarnThreshold[]> {
	const cached = cache.get(guildId);
	if (cached) return cached;

	const thresholds = await fetchWarnThresholds(container.prisma, guildId);
	cache.set(guildId, thresholds);
	return thresholds;
}

// The thresholds are cached by every shard process, so a change in one of them makes the copies of the others stale.
onShardMessage('warnThresholdsUpdate', ({ guildId }) => cache.delete(guildId));

function changed(guildId: Snowflake) {
	cache.delete(guildId);
	broadcastShardMessage({ type: 'warnThresholdsUpdate', guildId });
}

/**
 * Sets the threshold of a number of warnings, which replaces the one the guild had for it.
 *
 * @returns Whether it was new.
 * @throws {@linkcode WarnThresholdLimitError} When the guild has the most thresholds it can have and this is one more.
 */
export async function addWarnThreshold(guildId: Snowflake, data: WarnThreshold): Promise<boolean> {
	const existing = await fetchWarnThresholds(container.prisma, guildId);
	if (existing.length >= MaximumWarnThresholds && !existing.some((entry) => entry.count === data.count)) {
		throw new WarnThresholdLimitError(MaximumWarnThresholds);
	}

	const created = await setWarnThreshold(container.prisma, guildId, data);
	changed(guildId);
	return created;
}

/**
 * Removes the threshold of a number of warnings.
 *
 * @returns Whether the guild had it.
 */
export async function removeWarnThreshold(guildId: Snowflake, count: number): Promise<boolean> {
	const deleted = await deleteWarnThreshold(container.prisma, guildId, count);
	if (deleted) changed(guildId);
	return deleted;
}

/**
 * What {@linkcode countActiveWarnings} reads of a case.
 */
export interface WarningCase {
	readonly type: TypeVariation;
	readonly createdAt: number;
	isUndo(): boolean;
	isArchived(): boolean;
	isCompleted(): boolean;
}

/**
 * Counts the warnings of a member that still count: not removed (completed), not archived, not the entry a removal
 * makes, and made within the period.
 *
 * @param entries - The cases of the member.
 * @param period - The period, in milliseconds; `0` counts every active warning.
 * @param now - The time to count from.
 */
export function countActiveWarnings(entries: Iterable<WarningCase>, period: number, now = Date.now()): number {
	const since = period > 0 ? now - period : Number.NEGATIVE_INFINITY;
	let count = 0;
	for (const entry of entries) {
		if (entry.type !== TypeVariation.Warning || entry.isUndo() || entry.isArchived() || entry.isCompleted()) continue;
		if (entry.createdAt >= since) count++;
	}

	return count;
}

/**
 * The threshold a member reached with the warning they just got: the one with the highest count whose number of active
 * warnings, counted in its own period, is exactly its count. A count that is passed is not reached again by the next
 * warning, so the action of a threshold is taken once per warning that reaches it.
 *
 * @param thresholds - The thresholds of the guild.
 * @param entries - The cases of the member, the new warning included.
 * @param now - The time to count from.
 */
export function findReachedWarnThreshold(thresholds: readonly WarnThreshold[], entries: readonly WarningCase[], now = Date.now()) {
	const sorted = [...thresholds].sort((a, b) => b.count - a.count);
	return sorted.find((threshold) => countActiveWarnings(entries, threshold.period, now) === threshold.count) ?? null;
}

/**
 * Takes the action of a threshold of warnings on a member, in the name of the bot, so it is a case like the ones of
 * the commands. It says which threshold it is for.
 *
 * @param guild - The guild of the member.
 * @param userId - The ID of the member.
 * @param threshold - The threshold that was reached.
 */
export async function applyWarnThreshold(guild: Guild, userId: Snowflake, threshold: WarnThreshold) {
	const t = await fetchGuildT(guild);
	const reason = t('moderationActions:warnThresholdReason', { count: threshold.count });
	const { duration } = threshold;
	const options = { user: userId, reason };

	const unlock = (await getModeration(guild)).createLock();
	try {
		switch (threshold.action) {
			case 'Timeout':
				// Discord takes no timeout without an end:
				if (duration === null) return null;
				return await ModerationActions.timeout.apply(guild, { ...options, duration });
			case 'Mute':
				return await ModerationActions.mute.apply(guild, { ...options, duration });
			case 'Kick':
				return await ModerationActions.kick.apply(guild, options);
			case 'Softban':
				return await ModerationActions.softban.apply(guild, options, { context: seconds.fromMinutes(5) });
			case 'Ban':
				return await ModerationActions.ban.apply(guild, { ...options, duration });
			case 'VoiceKick':
				return await ModerationActions.voiceKick.apply(guild, options);
		}
	} finally {
		unlock();
	}
}
