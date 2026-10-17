import { fetchFlattenedGuild, flattenUser, type FlattenedGuild } from '#lib/api/ApiTransformers';
import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, ratelimit } from '#lib/api/utils';
import { seconds } from '#common';
import { isNullish } from '@sapphire/utilities';
import { HttpCodes, Route } from '@wolfstar/plugin-api';
import { isIterableCache } from '@wolfstar/plugin-cache';
import type { Guild } from '@wolfstar/plugin-gateway';

export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(5), 2, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const client = this.container.gatewayClient;
		const user = await client.users.fetch(request.auth!.id).catch(() => null);
		if (user === null) return response.error(HttpCodes.InternalServerError);

		const guilds: FlattenedGuild[] = [];
		for (const guild of await this.fetchCachedGuilds(user.id)) {
			guilds.push(await fetchFlattenedGuild(guild));
		}
		return response.json({ ...flattenUser(user), guilds });
	}

	/**
	 * Gets the cached guilds that hold a cached member for the user, what `guild.members.cache.has(user.id)` gave for every
	 * guild in discord.js.
	 *
	 * @remarks
	 *
	 * The gateway managers cannot list what they cache, so the IDs of the guilds are read from the raw guild store, which
	 * only the stores that can enumerate their entries (the in-memory and the Redis ones) support.
	 *
	 * @param userId The ID of the user.
	 */
	private async fetchCachedGuilds(userId: string): Promise<Guild[]> {
		const client = this.container.gatewayClient;
		const store = client.cache?.guilds;
		if (isNullish(store) || !isIterableCache(store)) return [];

		const guilds = await Promise.all(
			(await store.keys()).map(async (key) => {
				const guild = await client.guilds.cache.get(key);
				if (isNullish(guild)) return null;

				return (await client.members.cache.has(client.members.resolveKey(guild.id, userId))) ? guild : null;
			})
		);

		return guilds.filter((guild) => guild !== null);
	}
}
