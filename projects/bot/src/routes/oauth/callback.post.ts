import { getAuth } from '#lib/api/utils';
import { HttpCodes, Route, type MimeType } from '@wolfstar/plugin-api';
import { OAuth2Routes, type RESTPostOAuth2AccessTokenResult, type RESTPostOAuth2AccessTokenURLEncodedData } from 'discord-api-types/v10';
import { stringify } from 'node:querystring';

/**
 * Exchanges the code of the OAuth2 flow for the session cookie of the user.
 *
 * @remarks
 *
 * A port of the `oauth/callback` route built into `@sapphire/plugin-api`, which `@wolfstar/plugin-api` does not ship.
 */
export class UserRoute extends Route {
	public async run(request: Route.Request, response: Route.Response) {
		const auth = getAuth();
		// The built-in route was only loaded with the authentication enabled:
		if (auth === null) return response.error(HttpCodes.NotFound);

		const body = (await request.readBodyJson()) as OAuth2BodyData | null;
		if (typeof body?.code !== 'string') {
			return response.badRequest();
		}

		const value = await this.fetchAuth(body);
		if (value === null) {
			return response.status(HttpCodes.InternalServerError).json({ error: 'Failed to fetch the token.' });
		}

		const now = Date.now();
		const data = await auth.fetchData(value.access_token);
		if (!data.user) {
			return response.status(HttpCodes.InternalServerError).json({ error: 'Failed to fetch the user.' });
		}

		const token = auth.encrypt({
			id: data.user.id,
			expires: now + value.expires_in * 1000,
			refresh: value.refresh_token,
			token: value.access_token
		});

		auth.setCookie(response, token, value.expires_in);
		return response.json(data);
	}

	private async fetchAuth(body: OAuth2BodyData) {
		const auth = getAuth()!;

		const data: RESTPostOAuth2AccessTokenURLEncodedData = {
			client_id: auth.id,
			client_secret: auth.secret,
			code: body.code,
			grant_type: 'authorization_code',
			redirect_uri: auth.redirect ?? body.redirectUri
		};

		const result = await fetch(OAuth2Routes.tokenURL, {
			method: 'POST',
			body: stringify(data as any),
			headers: {
				'content-type': 'application/x-www-form-urlencoded' satisfies MimeType
			}
		});

		const json = await result.json();
		if (result.ok) return json as RESTPostOAuth2AccessTokenResult;

		this.container.logger.error(json);
		return null;
	}
}

/**
 * The OAuth2 body data sent to the callback.
 */
interface OAuth2BodyData {
	/**
	 * The code sent by the client.
	 */
	code: string;

	/**
	 * The client's ID.
	 */
	clientId: string;

	/**
	 * The redirect URI.
	 */
	redirectUri: string;
}
