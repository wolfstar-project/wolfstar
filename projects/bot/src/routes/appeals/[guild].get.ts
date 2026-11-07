import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, ratelimit } from '#lib/api/utils';
import { getAppealPage } from '#lib/moderation/appealService';
import { seconds } from 'wolfstar-shared';
import { HttpCodes, Route } from '@wolfstar/plugin-api';

/**
 * `GET /appeals/:guild`: what the user who is logged in can do with the appeals of a guild, for the appeal page of the
 * website, see `getAppealPage`. The user does not need to be a member: a banned one is not.
 */
export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(5), 5, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const guild = await this.container.gatewayClient.guilds.resolve(String(request.params.guild));
		if (!guild) return response.error(HttpCodes.NotFound);

		return response.json(await getAppealPage(guild, request.auth!.id));
	}
}
