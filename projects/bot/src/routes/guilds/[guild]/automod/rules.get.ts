import { resolveManagedGuildId } from '#lib/api/automod';
import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, ratelimit } from '#lib/api/utils';
import { readAutoModerationRules } from '#lib/moderation/automod/rules';
import { seconds } from '#common';
import { Route } from '@wolfstar/plugin-api';

/**
 * `GET /guilds/:guild/automod/rules`: the auto-moderation rules of a guild.
 */
export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(5), 2, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const guildId = await resolveManagedGuildId(request, response);
		if (guildId === null) return;

		return response.json(await readAutoModerationRules(guildId));
	}
}
