import type { ApiAuthRequest } from '#lib/api/Auth';
import { canManage } from '#lib/api/utils';
import { AutoModerationRuleError } from '#lib/moderation/automod/rules';
import { container } from '@wolfstar/http-framework';
import { HttpCodes, type Route } from '@wolfstar/plugin-api';
import { MaximumAutoModerationRules } from 'wolfstar-database';

/**
 * Checks that who makes a request to an auto-moderation rules route can manage the guild of its path, and answers the
 * request when they cannot.
 *
 * @returns The ID of the guild, or `null` when the request was answered.
 */
export async function resolveManagedGuildId(request: ApiAuthRequest, response: Route.Response): Promise<string | null> {
	const guildId = request.params.guild;

	const guild = await container.gatewayClient.guilds.resolve(guildId);
	if (!guild) {
		response.error(HttpCodes.BadRequest);
		return null;
	}

	const member = await container.gatewayClient.members.fetch(guildId, request.auth!.id).catch(() => null);
	if (!member) {
		response.error(HttpCodes.BadRequest);
		return null;
	}

	if (!(await canManage(guild, member))) {
		response.error(HttpCodes.Forbidden);
		return null;
	}

	return guild.id;
}

/**
 * Answers a request with what went wrong when a rule was created, edited or deleted.
 *
 * @param error - What was thrown, thrown again when it is not a {@linkcode AutoModerationRuleError}.
 */
export function sendAutoModerationRuleError(response: Route.Response, error: unknown) {
	if (!(error instanceof AutoModerationRuleError)) throw error;

	switch (error.code) {
		case 'limit':
			return response.status(HttpCodes.BadRequest).json([`A guild cannot have more than ${MaximumAutoModerationRules} rules.`]);
		case 'nameTaken':
			return response.status(HttpCodes.Conflict).json(['name: There is already a rule with that name.']);
		case 'nameInvalid':
			return response.status(HttpCodes.BadRequest).json(['name: The name is not valid.']);
		case 'unknown':
			return response.error(HttpCodes.NotFound);
	}
}
