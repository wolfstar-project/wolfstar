import { resolveRequestAuth, type ApiAuthRequest } from '#lib/api/Auth';
import { getAuth } from '#lib/api/utils';
import { HttpCodes, Route, type MimeType } from '@wolfstar/plugin-api';
import { OAuth2Routes } from 'discord-api-types/v10';
import { stringify } from 'node:querystring';

/**
 * Revokes the access token of the user and removes their session cookie.
 *
 * @remarks
 *
 * A port of the `oauth/logout` route built into `@sapphire/plugin-api`, which `@wolfstar/plugin-api` does not ship.
 */
export class UserRoute extends Route {
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const auth = getAuth();
		// The built-in route was only loaded with the authentication enabled:
		if (auth === null) return response.error(HttpCodes.NotFound);

		if (!resolveRequestAuth(auth, request, response)) return response.status(HttpCodes.Unauthorized).json({ error: 'Unauthorized.' });

		const result = await this.revoke(request.auth!.token);
		if (result.ok) {
			// Sending an empty cookie with "expires" set to 1970-01-01 makes the browser instantly remove the cookie.
			auth.removeCookie(response);
			return response.json({ success: true });
		}

		return response.status(HttpCodes.InternalServerError).json({ error: 'Unexpected error from server.' });
	}

	private async revoke(token: string) {
		const auth = getAuth()!;

		// RFC 7009 2.1. Revocation Request
		// The following parameters must be formatted as "application/x-www-form-urlencoded" in the HTTP request-body:
		//
		// - token: The token that the client wants to get revoked.
		// - token_type_hint: A hint about the type of the token submitted for revocation.
		return fetch(OAuth2Routes.tokenRevocationURL, {
			method: 'POST',
			body: stringify({ token, client_id: auth.id, client_secret: auth.secret }),
			headers: {
				'content-type': 'application/x-www-form-urlencoded' satisfies MimeType
			}
		});
	}
}
