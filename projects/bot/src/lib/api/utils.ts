import { fetchFlattenedGuild, flattenGuild } from '#lib/api/ApiTransformers';
import { Auth, resolveRequestAuth, type ApiAuthRequest, type LoginData } from '#lib/api/Auth';
import type { OauthFlattenedGuild, PartialOauthFlattenedGuild, TransformedLoginData } from '#lib/api/types';
import { canManageServerSettings } from '#lib/structures/commands/permissions';
import { PermissionsBits } from 'wolfstar-shared';
import { RateLimitManager } from '@sapphire/ratelimits';
import { createFunctionPrecondition } from '@wolfstar/decorators';
import { container } from '@wolfstar/http-framework';
import { HttpCodes } from '@wolfstar/plugin-api';
import type { ApiResponse } from '@wolfstar/plugin-api';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import {
	GuildDefaultMessageNotifications,
	GuildExplicitContentFilter,
	GuildMFALevel,
	GuildPremiumTier,
	GuildVerificationLevel,
	Locale,
	PermissionFlagsBits,
	type RESTAPIPartialCurrentUserGuild
} from 'discord-api-types/v10';

let auth: Auth | null | undefined;

/**
 * Gets the OAuth2 authentication of the API, `null` when it is disabled (no `OAUTH_SECRET`).
 *
 * @remarks
 *
 * `@sapphire/plugin-api` built it from the `auth` option of the server as `container.server.auth`, an option
 * `@wolfstar/plugin-api` does not have, so it is built here from the same environment variables the original bot read.
 */
export function getAuth(): Auth | null {
	if (auth === undefined) {
		const { CLIENT_ID, OAUTH_SECRET, OAUTH_COOKIE, OAUTH_REDIRECT_URI, OAUTH_SCOPE, OAUTH_DOMAIN_OVERWRITE } = process.env;
		auth = Auth.create({
			id: CLIENT_ID,
			secret: OAUTH_SECRET,
			cookie: OAUTH_COOKIE || undefined,
			redirect: OAUTH_REDIRECT_URI || undefined,
			scopes: OAUTH_SCOPE ? OAUTH_SCOPE.split(' ') : undefined,
			transformers: [transformOauthGuildsAndUser],
			domainOverwrite: OAUTH_DOMAIN_OVERWRITE || null
		});
	}

	return auth;
}

export const authenticated = () =>
	createFunctionPrecondition(
		(request: ApiAuthRequest, response: ApiResponse) => Boolean(resolveRequestAuth(getAuth(), request, response)?.token),
		(_request: ApiAuthRequest, response: ApiResponse) => response.error(HttpCodes.Unauthorized)
	);

/**
 * @param time The amount of milliseconds for the ratelimits from this manager to expire.
 * @param limit The amount of times a {@link RateLimit} can drip before it's limited.
 * @param auth Whether or not this should be auth-limited
 */
export function ratelimit(time: number, limit = 1, auth = false) {
	const manager = new RateLimitManager(time, limit);
	const xRateLimitLimit = time;
	return createFunctionPrecondition(
		(request: ApiAuthRequest, response: ApiResponse) => {
			const id = (auth ? request.auth!.id : request.headers['x-forwarded-for'] || request.socket.remoteAddress) as string;
			const bucket = manager.acquire(id);

			response.setHeader('Date', new Date().toUTCString());
			if (bucket.limited) {
				response.setHeader('Retry-After', bucket.remainingTime.toString());
				return false;
			}

			try {
				bucket.consume();
			} catch {}

			response.setHeader('X-RateLimit-Limit', xRateLimitLimit);
			response.setHeader('X-RateLimit-Remaining', bucket.remaining.toString());
			response.setHeader('X-RateLimit-Reset', bucket.remainingTime.toString());

			return true;
		},
		(_request: ApiAuthRequest, response: ApiResponse) => {
			response.error(HttpCodes.TooManyRequests);
		}
	);
}

/**
 * Whether a member may manage a server from the dashboard and the API, see `canManageServerSettings`.
 */
export async function canManage(guild: Guild, member: GuildMember): Promise<boolean> {
	if (member.id === null) return false;
	if (guild.ownerId === member.id) return true;

	const permissions = await member.permissions;
	return canManageServerSettings({
		guildId: guild.id,
		userId: member.id,
		roleIds: member.roles.ids,
		manageGuild: permissions.has(PermissionFlagsBits.ManageGuild)
	});
}

async function getManageable(id: string, oauthGuild: RESTAPIPartialCurrentUserGuild, guild: Guild | null): Promise<boolean> {
	if (oauthGuild.owner) return true;
	if (guild === null) return PermissionsBits.has(BigInt(oauthGuild.permissions), PermissionFlagsBits.ManageGuild);

	const member = await container.gatewayClient.members.fetch(guild.id, id).catch(() => null);
	if (!member) return false;

	return canManage(guild, member);
}

async function transformGuild(userId: string, data: RESTAPIPartialCurrentUserGuild): Promise<OauthFlattenedGuild> {
	const guild = await container.gatewayClient.guilds.resolve(data.id);
	const serialized: PartialOauthFlattenedGuild =
		guild === null
			? {
					afkChannelId: null,
					afkTimeout: 0,
					applicationId: null,
					approximateMemberCount: null,
					approximatePresenceCount: null,
					available: true,
					banner: null,
					channels: [],
					defaultMessageNotifications: GuildDefaultMessageNotifications.OnlyMentions,
					description: null,
					widgetEnabled: false,
					explicitContentFilter: GuildExplicitContentFilter.Disabled,
					icon: data.icon,
					id: data.id,
					joinedTimestamp: null,
					mfaLevel: GuildMFALevel.None,
					name: data.name,
					ownerId: data.owner ? userId : null,
					partnered: false,
					preferredLocale: Locale.EnglishUS,
					premiumSubscriptionCount: null,
					premiumTier: GuildPremiumTier.None,
					roles: [],
					splash: null,
					systemChannelId: null,
					vanityURLCode: null,
					verificationLevel: GuildVerificationLevel.None,
					verified: false
				}
			: // The channels and the roles are fetched from Discord, a guild that fails to is sent without them:
				await fetchFlattenedGuild(guild).catch(() => flattenGuild(guild, [], []));

	return {
		...serialized,
		permissions: data.permissions,
		manageable: await getManageable(userId, data, guild),
		wolfstarIsIn: guild !== null
	};
}

export async function transformOauthGuildsAndUser({ user, guilds }: LoginData): Promise<TransformedLoginData> {
	if (!user || !guilds) return { user, guilds };

	const userId = user.id;

	const transformedGuilds = await Promise.all(guilds.map((guild) => transformGuild(userId, guild)));
	return { user, transformedGuilds };
}
