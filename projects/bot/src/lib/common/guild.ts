import { container } from '@sapphire/framework';
import type { Guild, GuildResolvable } from '@wolfstar/plugin-gateway';

/**
 * Resolves the guild ID out of a {@link GuildResolvable}: the guild itself, an entity belonging to one
 * (`guildId`), or a bare snowflake.
 */
function resolveGuildId(resolvable: GuildResolvable): string {
	if (typeof resolvable === 'string') return resolvable;
	if ('guildId' in resolvable) {
		if (resolvable.guildId === null) throw new TypeError(`${resolvable} has no guild.`);
		return resolvable.guildId;
	}

	return resolvable.id;
}

export async function resolveGuild(resolvable: GuildResolvable): Promise<Guild> {
	const id = resolveGuildId(resolvable);
	const guild = await container.gatewayClient.guilds.resolve(id);
	if (guild === null) throw new TypeError(`${id} resolved to null.`);

	return guild;
}
