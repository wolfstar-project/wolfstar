import { broadcastShardMessage, onShardMessage } from '#lib/sharder/messages';
import { withSharedLock } from '#utils/locks';
import { Collection } from '@discordjs/collection';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import { fetchJoinGuardRules, fetchTableSettings, type JoinGuardRule, type JoinGuardSettings } from 'wolfstar-database';

/**
 * What the join guard of a guild is set up with: its settings and its rules.
 */
export interface JoinGuardConfig {
	readonly settings: JoinGuardSettings;
	readonly rules: readonly JoinGuardRule[];
}

/**
 * How long the configuration of a guild is kept, in milliseconds.
 *
 * @remarks The dashboard writes the settings and the rules in the database itself and tells the bot nothing, so the
 * configuration cannot be kept until a write of the bot drops it, as the other settings are: a change made there
 * applies within this time. The members of a raid join within seconds of each other, and read it once.
 */
export const JoinGuardConfigLifetime = 10_000;

interface CachedConfig {
	readonly config: JoinGuardConfig;
	readonly expiresAt: number;
}

const cache = new Collection<Snowflake, CachedConfig>();
const queue = new Collection<Snowflake, Promise<JoinGuardConfig>>();
const versions = new Collection<Snowflake, number>();

/**
 * Reads what the join guard of a guild is set up with, as the database had it {@linkcode JoinGuardConfigLifetime} ago at
 * most. The settings are read from their table alone, not from the cached settings of the guild.
 *
 * @param guildId - The guild.
 */
export function readJoinGuardConfig(guildId: Snowflake): Promise<JoinGuardConfig> {
	const cached = cache.get(guildId);
	if (cached !== undefined && cached.expiresAt > Date.now()) return Promise.resolve(cached.config);

	const previous = queue.get(guildId);
	if (previous) return previous;

	const version = versions.get(guildId) ?? 0;
	const { orm } = container.prisma;
	const promise = Promise.all([fetchTableSettings(orm, 'GuildJoinGuard', guildId), fetchJoinGuardRules(orm, guildId)])
		.then(([settings, rules]) => {
			const config: JoinGuardConfig = { settings, rules };
			if ((versions.get(guildId) ?? 0) === version) cache.set(guildId, { config, expiresAt: Date.now() + JoinGuardConfigLifetime });
			return config;
		})
		.finally(() => {
			if (queue.get(guildId) === promise) queue.delete(guildId);
		});
	queue.set(guildId, promise);
	return promise;
}

/**
 * Forgets the configuration of the join guard of a guild in this process, so it is read again the next time.
 */
export function deleteJoinGuardConfigCached(guildId: Snowflake) {
	versions.set(guildId, (versions.get(guildId) ?? 0) + 1);
	cache.delete(guildId);
	// A query that is still running read the configuration before the change:
	queue.delete(guildId);
}

// The configuration is cached by every shard process, so a change in one of them makes the copies of the others stale:
onShardMessage('joinGuardUpdate', ({ guildId }) => deleteJoinGuardConfigCached(guildId));
onShardMessage('settingsInvalidateAll', () => {
	for (const guildId of new Set([...cache.keys(), ...queue.keys()])) deleteJoinGuardConfigCached(guildId);
});

/**
 * Tells this process and the other shards that the bot changed the settings or the rules of the join guard of a guild.
 */
export function announceJoinGuardChange(guildId: Snowflake) {
	deleteJoinGuardConfigCached(guildId);
	broadcastShardMessage({ type: 'joinGuardUpdate', guildId });
}

/**
 * Runs what changes the state of a member at the checkpoint of a guild (the join, the page, a moderator, the timeout,
 * the leave) under the lock every process respects, so two of them never act on the same member at once.
 *
 * @remarks The lock is of the member (`joinguard:<guildId>:<userId>`) and not of the guild: every change holds it across
 * requests to Discord, and the members of a raid would otherwise wait for each other, past the time a lock is waited
 * for.
 *
 * @param guildId - The guild.
 * @param userId - The member.
 * @param callback - What reads the state of the member and changes it.
 */
export function withJoinGuardMemberLock<T>(guildId: Snowflake, userId: Snowflake, callback: () => Promise<T>): Promise<T> {
	return withSharedLock(`joinguard:${guildId}:${userId}`, callback);
}
