import { resolveManagedGuildId, sendAutoModerationRuleError } from '#lib/api/automod';
import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, ratelimit } from '#lib/api/utils';
import { deleteAutoModerationRule } from '#lib/moderation/automod/rules';
import { seconds } from '#common';
import { HttpCodes, Route } from '@wolfstar/plugin-api';

/**
 * `DELETE /guilds/:guild/automod/rules/:rule`: deletes a rule.
 */
export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(1), 2, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const guildId = await resolveManagedGuildId(request, response);
		if (guildId === null) return;

		try {
			await deleteAutoModerationRule(guildId, request.params.rule);
			return response.status(HttpCodes.NoContent).end();
		} catch (error) {
			return sendAutoModerationRuleError(response, error);
		}
	}
}
