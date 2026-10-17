import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, getAuth, ratelimit } from '#lib/api/utils';
import { minutes, Time } from '#common';
import { HttpCodes, Route, type MimeType } from '@wolfstar/plugin-api';
import { OAuth2Routes, type RESTPostOAuth2AccessTokenResult } from 'discord-api-types/v10';
import { stringify } from 'node:querystring';

export class UserRoute extends Route {
	@authenticated()
	@ratelimit(minutes(5), 2, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const requestBody = (await request.readBodyJson()) as Record<string, string>;
		if (typeof requestBody.action !== 'string') {
			return response.badRequest();
		}

		if (requestBody.action === 'SYNC_USER') {
			if (!request.auth) return response.error(HttpCodes.Unauthorized);

			const auth = getAuth()!;

			// If the token expires in a day, refresh
			let authToken = request.auth.token;
			if (Date.now() + Time.Day >= request.auth.expires) {
				const body = await this.refreshToken(request.auth.id, request.auth.refresh);
				if (body !== null) {
					const authentication = auth.encrypt({
						id: request.auth.id,
						token: body.access_token,
						refresh: body.refresh_token,
						expires: Date.now() + body.expires_in * 1000
					});

					auth.setCookie(response, authentication, body.expires_in);
					authToken = body.access_token;
				}
			}

			try {
				return response.json(await auth.fetchData(authToken));
			} catch (error) {
				this.container.logger.fatal(error);
				return response.error(HttpCodes.InternalServerError);
			}
		}

		return response.error(HttpCodes.BadRequest);
	}

	private async refreshToken(id: string, refreshToken: string) {
		const { logger } = this.container;
		const auth = getAuth()!;
		try {
			logger.debug(`Refreshing Token for ${id}`);
			const result = await fetch(OAuth2Routes.tokenURL, {
				method: 'POST',
				body: stringify({
					client_id: auth.id,
					client_secret: auth.secret,
					grant_type: 'refresh_token',
					refresh_token: refreshToken,
					redirect_uri: auth.redirect,
					scope: auth.scopes
				}),
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded' satisfies MimeType
				}
			});

			// `@sapphire/fetch` threw on a response that is not successful:
			if (!result.ok) throw new Error(`Received ${result.status} when refreshing the token for ${id}`);
			return (await result.json()) as RESTPostOAuth2AccessTokenResult;
		} catch (error) {
			logger.fatal(error);
			return null;
		}
	}
}
