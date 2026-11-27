import { broadcastShardMessage, onShardMessage } from '#lib/sharder/messages';
import { withSharedLock } from '#utils/locks';
import { Collection } from '@discordjs/collection';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import { fetchOnboardingConfig, type OnboardingConfig } from 'wolfstar-database';

/**
 * How long the onboarding of a guild is kept, in milliseconds. A write of the dashboard drops it at once through the
 * settings notification; this bounds what a lost notification leaves stale.
 */
export const OnboardingConfigLifetime = 10_000;

interface CachedConfig {
	readonly config: OnboardingConfig;
	readonly expiresAt: number;
}

const cache = new Collection<Snowflake, CachedConfig>();
const queue = new Collection<Snowflake, Promise<OnboardingConfig>>();
const versions = new Collection<Snowflake, number>();

/**
 * Reads the onboarding of a guild for what acts on members, as the database had it {@linkcode OnboardingConfigLifetime}
 * ago at most. An editor reads it from the database itself, with `fetchOnboardingConfig`, since it writes with the
 * revision it read.
 */
export function readOnboardingConfig(guildId: Snowflake): Promise<OnboardingConfig> {
	const cached = cache.get(guildId);
	if (cached !== undefined && cached.expiresAt > Date.now()) return Promise.resolve(cached.config);

	const previous = queue.get(guildId);
	if (previous) return previous;

	const version = versions.get(guildId) ?? 0;
	const promise = fetchOnboardingConfig(container.prisma.orm, guildId)
		.then((config) => {
			if ((versions.get(guildId) ?? 0) === version) cache.set(guildId, { config, expiresAt: Date.now() + OnboardingConfigLifetime });
			return config;
		})
		.finally(() => {
			if (queue.get(guildId) === promise) queue.delete(guildId);
		});
	queue.set(guildId, promise);
	return promise;
}

/**
 * Forgets the onboarding of a guild in this process, so it is read again the next time.
 */
export function deleteOnboardingConfigCached(guildId: Snowflake) {
	versions.set(guildId, (versions.get(guildId) ?? 0) + 1);
	cache.delete(guildId);
	// A query that is still running read the configuration before the change:
	queue.delete(guildId);
}

onShardMessage('onboardingUpdate', ({ guildId }) => deleteOnboardingConfigCached(guildId));
onShardMessage('settingsInvalidateAll', () => {
	for (const guildId of new Set([...cache.keys(), ...queue.keys()])) deleteOnboardingConfigCached(guildId);
});

/**
 * Tells this process and the other shards that the bot changed the onboarding of a guild.
 */
export function announceOnboardingChange(guildId: Snowflake) {
	deleteOnboardingConfigCached(guildId);
	broadcastShardMessage({ type: 'onboardingUpdate', guildId });
}

/**
 * Runs what changes the state of a member in the onboarding of a guild (the join, a click, the time limit, the leave)
 * under the lock every process respects, so two of them never act on the same member at once.
 */
export function withOnboardingMemberLock<T>(guildId: Snowflake, userId: Snowflake, callback: () => Promise<T>): Promise<T> {
	return withSharedLock(`onboarding:${guildId}:${userId}`, callback);
}
