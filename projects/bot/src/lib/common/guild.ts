import { container } from '@wolfstar/http-framework';
import type { Guild, GuildResolvable } from '@wolfstar/plugin-gateway';

/**
 * Resolves the id of the guild out of a {@link GuildResolvable}: the guild itself, an entity belonging to one
 * (`guildId`), or a bare snowflake.
 * @param resolvable The value to resolve the guild id from.
 */
export function resolveGuildId(resolvable: GuildResolvable): string {
	if (typeof resolvable === 'string') return resolvable;
	if ('guildId' in resolvable) {
		if (resolvable.guildId === null) throw new TypeError('The resolvable does not belong to a guild.');
		return resolvable.guildId;
	}

	return (resolvable as Guild).id;
}

/**
 * Resolves a {@link GuildResolvable} to its {@link Guild}, reading the gateway cache.
 * @param resolvable The value to resolve the guild from.
 */
export async function resolveGuild(resolvable: GuildResolvable): Promise<Guild> {
	const id = resolveGuildId(resolvable);
	const guild = await container.gatewayClient.guilds.resolve(id);
	if (guild === null) throw new TypeError(`${id} resolved to null.`);

	return guild;
}
