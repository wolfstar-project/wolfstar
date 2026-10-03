import { isThenable } from '@sapphire/utilities';
import { LoggerManager, ModerationManager, StickyRoleManager } from '#lib/moderation/managers';
import { resolveGuildId } from '#utils/common';
import { GuildSecurity } from '#utils/Security/GuildSecurity';
import { container } from '@wolfstar/http-framework';
import { Guild, type GuildResolvable } from '@wolfstar/plugin-gateway';

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
 * @remarks The guild is read from the gateway cache, so it must have been received through the gateway already. This
 * is the case for every guild the bot is in, as they are cached when the shard receives `GUILD_CREATE`.
 * @param resolvable The guild, an entity belonging to a guild, or a guild id.
 */
export function getGuildUtilities(resolvable: GuildResolvable): GuildUtilities {
	const id = resolveGuildId(resolvable);
	const previous = cache.get(id);
	if (previous !== undefined) return previous;

	const guild = resolvable instanceof Guild ? resolvable : container.gatewayClient.guilds.cache.get(id);
	if (isThenable(guild)) throw new TypeError(`The guild ${id} cannot be read synchronously, its cache is asynchronous.`);
	if (guild === undefined) throw new TypeError(`The guild ${id} is not cached.`);

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
	return (resolvable: GuildResolvable): GuildUtilities[K] => getGuildUtilities(resolvable)[property];
}
