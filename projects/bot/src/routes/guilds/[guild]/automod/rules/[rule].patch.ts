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

		// The body is read once, and checked against the rule as it is cached to answer a bad one with a 400:
		const body = await request.readBodyJson();
		const { errors } = parseAutoModerationRulePatch(rule.type, body, rule.options);
		if (errors) return response.status(HttpCodes.BadRequest).json(errors);

		try {
			// The options are merged on the rule the database has inside the queue, so two requests that change different
			// options do not restore each other's old value:
			return response.json(
				await updateAutoModerationRule(guildId, rule.id, (current) => parseAutoModerationRulePatch(rule.type, body, current.options).data!)
			);
		} catch (error) {
			return sendAutoModerationRuleError(response, error);
		}
	}
}
