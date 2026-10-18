import { resolveManagedGuildId } from '#lib/api/automod';
import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, ratelimit } from '#lib/api/utils';
import { seconds } from 'wolfstar-shared';
import { HttpCodes, Route } from '@wolfstar/plugin-api';
import { fetchMessageHistory } from 'wolfstar-database';

/**
 * `GET /guilds/:guild/message-histories/:history`: a message history of a guild with its messages, by its ID.
 */
export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(5), 2, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const guildId = await resolveManagedGuildId(request, response);
		if (guildId === null) return;

		const history = await fetchMessageHistory(this.container.prisma, guildId, String(request.params.history));
		return history ? response.json(history) : response.error(HttpCodes.NotFound);
	}
}
