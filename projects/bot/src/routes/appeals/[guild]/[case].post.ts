import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, ratelimit } from '#lib/api/utils';
import { submitAppeal } from '#lib/moderation/appealService';
import { minutes } from '#common';
import { HttpCodes, Route } from '@wolfstar/plugin-api';

/**
 * `POST /appeals/:guild/:case`: appeals a case of the user who is logged in. The body is `{ answers: string[] }`, one
 * answer per question of the form. A case is appealed once.
 */
export class UserRoute extends Route {
	@authenticated()
	@ratelimit(minutes(1), 3, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const guild = await this.container.gatewayClient.guilds.resolve(String(request.params.guild));
		if (!guild) return response.error(HttpCodes.NotFound);

		const caseId = Number(request.params.case);
		if (!Number.isSafeInteger(caseId) || caseId < 1) return response.error(HttpCodes.BadRequest);

		const body = (await request.readBodyJson()) as { answers?: unknown } | null;
		const result = await submitAppeal(guild, request.auth!.id, caseId, body?.answers);
		if ('appeal' in result) return response.status(HttpCodes.Created).json(result.appeal);

		switch (result.error) {
			case 'disabled':
				return response.status(HttpCodes.Forbidden).json({ error: result.error });
			case 'notAppealable':
				return response.status(HttpCodes.NotFound).json({ error: result.error });
			case 'invalid':
				return response.status(HttpCodes.BadRequest).json({ error: result.error });
			case 'appealed':
				return response.status(HttpCodes.Conflict).json({ error: result.error });
		}
	}
}
