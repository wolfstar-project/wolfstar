import { resolveManagedGuildId } from '#lib/api/automod';
import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, ratelimit } from '#lib/api/utils';
import { seconds } from 'wolfstar-shared';
import { Route } from '@wolfstar/plugin-api';
import { fetchMessageHistories } from 'wolfstar-database';

/**
 * `GET /guilds/:guild/message-histories`: the message histories of a guild, newest first, without their messages
 * (`?user=` keeps the ones of a user). The messages of one are read with `GET /guilds/:guild/message-histories/:history`.
 */
export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(5), 2, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const guildId = await resolveManagedGuildId(request, response);
		if (guildId === null) return;

		const user = typeof request.query.user === 'string' && /^\d{17,20}$/.test(request.query.user) ? request.query.user : undefined;
		const histories = await fetchMessageHistories(this.container.prisma, guildId, user);
		return response.json(histories.map(({ messages, ...history }) => ({ ...history, count: messages.length })));
	}
}
