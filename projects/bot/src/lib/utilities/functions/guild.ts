import { LoggerManager, ModerationManager, StickyRoleManager } from '#lib/moderation/managers';
import { resolveGuild, resolveGuildId } from '#common';
import { GuildSecurity } from '#utils/Security/GuildSecurity';
import type { GuildResolvable } from '@wolfstar/plugin-gateway';

export interface GuildUtilities {
	readonly logger: LoggerManager;
	readonly moderation: ModerationManager;
	readonly security: GuildSecurity;
	readonly stickyRoles: StickyRoleManager;
}

/**
 * The per-guild utilities, by guild id.
 */
export const cache = new Map<string, GuildUtilities>();

/**
 * Gets, and creates if needed, the utilities of a guild.
 *
 * @remarks The guild is resolved through the gateway client, which reads its cache and fetches the guild when it is
 * missing, so it works with an asynchronous cache such as the Redis one.
 * @param resolvable The guild, an entity belonging to a guild, or a guild id.
 */
export async function getGuildUtilities(resolvable: GuildResolvable): Promise<GuildUtilities> {
	const id = resolveGuildId(resolvable);
	const previous = cache.get(id);
	if (previous !== undefined) return previous;

	const guild = await resolveGuild(resolvable);

	// Another call may have created the entry while the guild was being resolved:
	const raced = cache.get(id);
	if (raced !== undefined) return raced;

	const entry: GuildUtilities = {
		logger: new LoggerManager(guild),
		moderation: new ModerationManager(guild),
		security: new GuildSecurity(guild),
		stickyRoles: new StickyRoleManager(guild)
	};
	cache.set(id, entry);

	return entry;
}

/**
 * Drops the utilities of a guild, for example when the bot leaves it.
 * @param resolvable The guild, an entity belonging to a guild, or a guild id.
 */
export function removeGuildUtilities(resolvable: GuildResolvable): boolean {
	return cache.delete(resolveGuildId(resolvable));
}

export const getLogger = getProperty('logger');
export const getModeration = getProperty('moderation');
export const getSecurity = getProperty('security');
export const getStickyRoles = getProperty('stickyRoles');

function getProperty<K extends keyof GuildUtilities>(property: K) {
	return async (resolvable: GuildResolvable): Promise<GuildUtilities[K]> => (await getGuildUtilities(resolvable))[property];
}
