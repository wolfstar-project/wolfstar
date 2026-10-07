import { resolveManagedGuildId, sendAutoModerationRuleError } from '#lib/api/automod';
import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, ratelimit } from '#lib/api/utils';
import { readAutoModerationRules, updateAutoModerationRule } from '#lib/moderation/automod/rules';
import { parseAutoModerationRulePatch } from '#lib/moderation/automod/validation';
import { seconds } from '#common';
import { HttpCodes, Route } from '@wolfstar/plugin-api';

/**
 * `PATCH /guilds/:guild/automod/rules/:rule`: edits a rule. The body has what changes; the options that are not given
 * keep their value, and the type of a rule cannot change.
 */
export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(1), 2, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const guildId = await resolveManagedGuildId(request, response);
		if (guildId === null) return;

		const rules = await readAutoModerationRules(guildId);
		const rule = rules.find((entry) => entry.id === request.params.rule);
		if (!rule) return response.error(HttpCodes.NotFound);

		const { data, errors } = parseAutoModerationRulePatch(rule.type, await request.readBodyJson(), rule.options);
		if (errors) return response.status(HttpCodes.BadRequest).json(errors);

		try {
			return response.json(await updateAutoModerationRule(guildId, rule.id, data));
		} catch (error) {
			return sendAutoModerationRuleError(response, error);
		}
	}
}
