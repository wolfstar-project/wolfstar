import { dispatchShardMessage, onShardMessage, type ShardMessageType } from '#lib/sharder/messages';
import { Events } from '#lib/types/Enums';
import { container } from '@wolfstar/http-framework';
import { shardIdForGuild } from '@wolfstar/plugin-sharder';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * A write of the dashboard to the settings of a guild: the flat `GuildData` keys it changed, never their values.
 */
export interface DashboardSettingsUpdate {
	readonly guildId: Snowflake;
	readonly keys: readonly string[];
}

/**
 * Reads the payload of `guild_settings_update`: `{ "guildId": "<snowflake>", "keys": ["<key>", …] }`.
 *
 * @returns The write, `null` when the payload is not one.
 */
export function parseDashboardSettingsUpdate(payload: string): DashboardSettingsUpdate | null {
	let value: unknown;
	try {
		value = JSON.parse(payload);
	} catch {
		// What is not JSON is not a write, which the caller reports:
		return null;
	}

	if (typeof value !== 'object' || value === null) return null;

	const { guildId, keys } = value as Record<string, unknown>;
	if (typeof guildId !== 'string' || !/^\d{17,20}$/.test(guildId)) return null;
	if (!Array.isArray(keys) || !keys.every((key): key is string => typeof key === 'string' && key.length > 0)) return null;

	return { guildId, keys: [...new Set(keys)] };
}

/**
 * The messages that drop a cache of the rows the dashboard writes next to the settings (the auto-moderation rules, the
 * automatic deletions, the reasons, the thresholds of warnings, the role rules, the join guard). The payload names
 * the keys of the settings only, so a write of the dashboard drops them all for its guild.
 */
const DerivedCacheMessages = [
	'automodRulesUpdate',
	'cleanupUpdate',
	'moderationReasonsUpdate',
	'warnThresholdsUpdate',
	'roleRulesUpdate',
	'joinGuardUpdate'
] as const satisfies readonly ShardMessageType[];

/**
 * Whether the events of a guild reach this process: it is the only process, or it connects the gateway shard of the
 * guild.
 */
export function isOwnGuild(guildId: Snowflake): boolean {
	const shard = container.shard ?? null;
	return shard === null || shard.shards.includes(shardIdForGuild(guildId, shard.shardCount));
}

/**
 * Handles a write of the dashboard in this process: the settings of the guild are dropped (by the handler of
 * `settingsUpdate` of the settings), and so are the caches derived from what the dashboard writes. The process that
 * handles the guild then emits {@linkcode Events.DashboardSettingsUpdate}, once for the whole bot, for what has to act
 * on the change, such as the warning of the honeypot.
 *
 * @param update - The write.
 */
export function handleDashboardSettingsUpdate(update: DashboardSettingsUpdate) {
	for (const type of DerivedCacheMessages) dispatchShardMessage({ type, guildId: update.guildId });
	if (isOwnGuild(update.guildId)) container.client.emit(Events.DashboardSettingsUpdate, update.guildId, update.keys);
}

// A write of the bot has no keys, and is not one of the dashboard:
onShardMessage('settingsUpdate', ({ guildId, keys }) => {
	if (keys !== undefined) handleDashboardSettingsUpdate({ guildId, keys });
});
