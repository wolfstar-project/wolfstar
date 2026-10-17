import { resolveManagedGuildId, sendAutoModerationRuleError } from '#lib/api/automod';
import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, ratelimit } from '#lib/api/utils';
import { createAutoModerationRule } from '#lib/moderation/automod/rules';
import { parseAutoModerationRulePatch } from '#lib/moderation/automod/validation';
import { seconds } from '#common';
import { HttpCodes, Route } from '@wolfstar/plugin-api';
import { isAutoModerationRuleType } from 'wolfstar-database';

/**
 * `POST /guilds/:guild/automod/rules`: creates a rule. The body has the `name` and the `type` of the rule, and
 * whatever else it does not take the default of.
 */
export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(1), 2, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const guildId = await resolveManagedGuildId(request, response);
		if (guildId === null) return;

		const body = (await request.readBodyJson()) as { name?: unknown; type?: unknown } | null;
		if (typeof body?.name !== 'string') return response.status(HttpCodes.BadRequest).json(['name: Expected a string.']);
		if (!isAutoModerationRuleType(body.type)) return response.status(HttpCodes.BadRequest).json(['type: Unknown type of rule.']);

		const { data, errors } = parseAutoModerationRulePatch(body.type, body);
		if (errors) return response.status(HttpCodes.BadRequest).json(errors);

		try {
			const { name, ...rest } = data;
			return response.status(HttpCodes.Created).json(await createAutoModerationRule(guildId, name!, body.type, rest));
		} catch (error) {
			return sendAutoModerationRuleError(response, error);
		}
	}
}
