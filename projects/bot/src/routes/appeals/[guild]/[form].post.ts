import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, ratelimit } from '#lib/api/utils';
import { submitAppeal } from '#lib/moderation/appealService';
import { minutes } from 'wolfstar-shared';
import { HttpCodes, Route } from '@wolfstar/plugin-api';

/**
 * The form in the path of the built-in one, which a guild with no enabled form gets and which has no ID.
 */
const BuiltInForm = 'builtin';

/**
 * `POST /appeals/:guild/:form`: appeals a case of the user who is logged in with a form. The body is
 * `{ caseId: number, answers: { [questionId]: … } }`, the files of an answer being uploaded to the website first. A case
 * is appealed once.
 */
export class UserRoute extends Route {
	@authenticated()
	@ratelimit(minutes(1), 3, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const guild = await this.container.gatewayClient.guilds.resolve(String(request.params.guild));
		if (!guild) return response.error(HttpCodes.NotFound);

		const body = (await request.readBodyJson()) as { caseId?: unknown; answers?: unknown } | null;
		const caseId = Number(body?.caseId);
		if (!Number.isSafeInteger(caseId) || caseId < 1) return response.error(HttpCodes.BadRequest);

		const form = String(request.params.form);
		const result = await submitAppeal(guild, request.auth!.id, form === BuiltInForm ? null : form, caseId, body?.answers);
		if ('appeal' in result) return response.status(HttpCodes.Created).json(result.appeal);

		switch (result.error) {
			case 'disabled':
			case 'blocked':
			case 'locked':
				return response.status(HttpCodes.Forbidden).json({ error: result.error });
			case 'notFound':
			case 'notAppealable':
				return response.status(HttpCodes.NotFound).json({ error: result.error });
			case 'invalid':
				return response.status(HttpCodes.BadRequest).json({ error: result.error });
			case 'appealed':
				return response.status(HttpCodes.Conflict).json({ error: result.error });
		}
	}
}
