/**
 * Ported from `Auth` of `@sapphire/plugin-api`:
 * https://github.com/sapphiredev/plugins/blob/main/packages/api/src/lib/structures/http/Auth.ts
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2020 The Sapphire Community and its contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import type { ApiRequest, ApiResponse } from '@wolfstar/plugin-api';
import {
	RouteBases,
	Routes,
	type RESTGetAPICurrentUserConnectionsResult,
	type RESTGetAPICurrentUserGuildsResult,
	type RESTGetAPICurrentUserResult,
	type Snowflake
} from 'discord-api-types/v10';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * The OAuth2 authentication of the API: it encrypts the session of a user into a cookie, reads it back, and fetches the
 * data of the user from Discord.
 *
 * @remarks
 *
 * A port of `Auth` from `@sapphire/plugin-api`, which `@wolfstar/plugin-api` does not ship. The cookies are encrypted
 * the same way, so the sessions of the original bot stay valid.
 */
export class Auth {
	/**
	 * The client's application id, this can be retrieved in Discord Developer Portal at https://discord.com/developers/applications.
	 */
	public id: Snowflake;

	/**
	 * The name for the cookie, this will be used to identify a Secure HttpOnly cookie.
	 */
	public cookie: string;

	/**
	 * The scopes defined at https://discord.com/developers/docs/topics/oauth2#shared-resources-oauth2-scopes.
	 */
	public scopes: readonly string[];

	/**
	 * The redirect uri.
	 */
	public redirect: string | undefined;

	/**
	 * The transformers used for {@link Auth.fetchData}.
	 */
	public transformers: LoginDataTransformer[];

	/**
	 * The domain the cookie is set for, the domain of the request's host when `null`.
	 */
	public domainOverwrite: string | null = null;

	#secret: string;

	public constructor(options: AuthOptions) {
		this.id = options.id;
		this.cookie = options.cookie ?? 'SAPPHIRE_AUTH';
		this.scopes = options.scopes ?? ['identify'];
		this.redirect = options.redirect;
		this.#secret = options.secret;
		this.transformers = options.transformers ?? [];
		this.domainOverwrite = options.domainOverwrite ?? null;
	}

	/**
	 * The client secret, this can be retrieved in Discord Developer Portal at https://discord.com/developers/applications.
	 */
	public get secret() {
		return this.#secret;
	}

	/**
	 * Encrypts an object with aes-256-cbc to use as a token.
	 * @param data An object to encrypt
	 */
	public encrypt(data: AuthData): string {
		const iv = randomBytes(16);
		const cipher = createCipheriv('aes-256-cbc', this.#secret, iv);
		return `${cipher.update(JSON.stringify(data), 'utf8', 'base64') + cipher.final('base64')}.${iv.toString('base64')}`;
	}

	/**
	 * Decrypts an object with aes-256-cbc to use as a token.
	 * @param token An data to decrypt
	 */
	public decrypt(token: string): AuthData | null {
		const [data, iv] = token.split('.');

		try {
			const decipher = createDecipheriv('aes-256-cbc', this.#secret, Buffer.from(iv, 'base64'));
			const parsed = JSON.parse(decipher.update(data, 'base64', 'utf8') + decipher.final('utf8')) as AuthData;
			// If the token expired, return null:
			return parsed.expires >= Date.now() ? parsed : null;
		} catch {
			return null;
		}
	}

	/**
	 * Retrieves the data for a specific user.
	 * @param token The access token from the user.
	 */
	public async fetchData(token: string): Promise<LoginData> {
		// Fetch the information:
		const [user, guilds, connections] = await Promise.all([
			this.fetchInformation<RESTGetAPICurrentUserResult>('identify', token, `${RouteBases.api}${Routes.user()}`),
			this.fetchInformation<RESTGetAPICurrentUserGuildsResult>('guilds', token, `${RouteBases.api}${Routes.userGuilds()}`),
			this.fetchInformation<RESTGetAPICurrentUserConnectionsResult>('connections', token, `${RouteBases.api}${Routes.userConnections()}`)
		]);

		// Transform the information:
		let data: LoginData = { user, guilds, connections };
		for (const transformer of this.transformers) {
			data = await transformer(data);
		}

		return data;
	}

	/**
	 * Stores the encrypted session of a user in the cookie.
	 * @param response The response to set the cookie in.
	 * @param value The encrypted session, see {@link Auth.encrypt}.
	 * @param maxAge The amount of seconds the cookie lives for.
	 */
	public setCookie(response: ApiResponse, value: string, maxAge: number) {
		response.cookies.add(this.cookie, value, { maxAge, domain: this.domainOverwrite ?? undefined });
	}

	/**
	 * Removes the cookie that holds the session of a user.
	 * @param response The response to remove the cookie from.
	 */
	public removeCookie(response: ApiResponse) {
		// `CookieStore#remove` takes no domain, so the cookie of an overwritten domain is expired by hand:
		if (this.domainOverwrite === null) {
			response.cookies.remove(this.cookie);
		} else {
			response.cookies.add(this.cookie, '', { expires: new Date(0), domain: this.domainOverwrite });
			response.cookies.delete(this.cookie);
		}
	}

	private async fetchInformation<T>(scope: string, token: string, url: string): Promise<T | null | undefined> {
		if (!this.scopes.includes(scope)) return undefined;

		const result = await fetch(url, {
			headers: {
				authorization: `Bearer ${token}`
			}
		});

		return result.ok ? ((await result.json()) as T) : null;
	}

	public static create(options?: Partial<AuthOptions>): Auth | null {
		if (!options?.secret || !options.id) return null;
		return new Auth(options as AuthOptions);
	}
}

/**
 * The options of {@link Auth}, `ServerOptionsAuth` in `@sapphire/plugin-api`.
 */
export interface AuthOptions {
	/**
	 * The client's application id, this can be retrieved in Discord Developer Portal at https://discord.com/developers/applications.
	 */
	id: string;

	/**
	 * The client's application secret, this can be retrieved in Discord Developer Portal at https://discord.com/developers/applications.
	 */
	secret: string;

	/**
	 * The name for the cookie, this will be used to identify a Secure HttpOnly cookie.
	 * @default 'SAPPHIRE_AUTH'
	 */
	cookie?: string;

	/**
	 * The URL that users will be redirected to after a successful login.
	 */
	redirect?: string;

	/**
	 * The scopes defined at https://discord.com/developers/docs/topics/oauth2#shared-resources-oauth2-scopes.
	 * @default ['identify']
	 */
	scopes?: readonly string[];

	/**
	 * Transformers to transform the raw data from Discord to a different structure.
	 * @default []
	 */
	transformers?: LoginDataTransformer[];

	/**
	 * The domain the cookie is set for.
	 * @default null
	 */
	domainOverwrite?: string | null;
}

/**
 * Defines the authentication data, this is to be encrypted and decrypted by the server.
 */
export interface AuthData {
	/**
	 * The user ID.
	 */
	id: string;

	/**
	 * The timestamp at which the token expires and needs to be refreshed.
	 */
	expires: number;

	/**
	 * The refresh token.
	 */
	refresh: string;

	/**
	 * The access token.
	 */
	token: string;
}

/**
 * The login data sent when fetching data from a user.
 */
export interface LoginData {
	/**
	 * The user data, defined when the `'identify'` scope is defined.
	 */
	user?: RESTGetAPICurrentUserResult | null;

	/**
	 * The guilds data, defined when the `'guilds'` scope is defined.
	 */
	guilds?: RESTGetAPICurrentUserGuildsResult | null;

	/**
	 * The connections data, defined when the `'connections'` scope is defined.
	 */
	connections?: RESTGetAPICurrentUserConnectionsResult | null;
}

/**
 * A login data transformer.
 * @template T The return type of the transformer, which may carry more information than {@link LoginData}.
 */
export type LoginDataTransformer<T extends LoginData = LoginData> = (data: LoginData) => T | PromiseLike<T>;

/**
 * A request that carries the session of its user, once {@link resolveRequestAuth} has read it.
 *
 * @remarks
 *
 * `@sapphire/plugin-api` set `request.auth` in its `auth` middleware. `@wolfstar/plugin-api` has neither the middleware nor
 * the property, so the routes type their request with this interface and the `authenticated` precondition fills it.
 */
export interface ApiAuthRequest extends ApiRequest {
	/**
	 * The session of the user: `null` when the cookie is missing, invalid or expired, and `undefined` when it was not read
	 * yet or the authentication is disabled.
	 */
	auth?: AuthData | null;
}

/**
 * Reads the session of the user who made a request from its cookie, once per request, like the `auth` middleware of
 * `@sapphire/plugin-api`. An invalid or expired cookie is removed.
 * @param auth The authentication of the API, `null` when it is disabled.
 * @param request The request to read the session of.
 * @param response The response of the request, which holds the cookies.
 */
export function resolveRequestAuth(auth: Auth | null, request: ApiAuthRequest, response: ApiResponse): AuthData | null | undefined {
	if (request.auth !== undefined || auth === null) return request.auth;

	const authorization = response.cookies.get(auth.cookie);
	if (authorization) {
		request.auth = auth.decrypt(authorization);
		if (request.auth === null) auth.removeCookie(response);
	} else {
		request.auth = null;
	}

	return request.auth;
}
