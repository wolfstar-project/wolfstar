import { resolveOnErrorCodes } from '#common';
import { getMissingJoinGuardChannelPermissions } from '#lib/moderation/joinguard/permissions';
import { OnboardingCaptchaAvailable, type OnboardingReadinessContext, type OnboardingRoleInfo } from '#lib/onboarding/readiness';
import { container } from '@wolfstar/http-framework';
import { ChannelType, GuildFeature, PermissionFlagsBits, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import type { OnboardingSettings } from 'wolfstar-database';

/**
 * Reads from Discord what the readiness of the stages of a guild is checked against.
 *
 * @remarks The guild is read from the API and not from the cache: the cache keeps the features a guild had when the
 * gateway sent it, and a server that turned Community on since would still read as one that has not.
 *
 * @param guildId - The guild.
 * @param settings - Its onboarding, for where the verification message is.
 */
export async function fetchOnboardingReadinessContext(guildId: Snowflake, settings: OnboardingSettings): Promise<OnboardingReadinessContext> {
	const { gatewayClient } = container;
	const me = await gatewayClient.members.fetchMe(guildId);
	const [guild, nativeOnboardingEnabled, hasMessage, roles, permissions, highest] = await Promise.all([
		gatewayClient.api.guilds.get(guildId),
		fetchNativeOnboardingEnabled(guildId),
		hasOnboardingMessage(settings),
		gatewayClient.roles.fetchAll(guildId),
		me.fetchPermissions(),
		me.roles.fetchHighest()
	]);

	const roleInfo = new Map<string, OnboardingRoleInfo>(
		roles
			// `@everyone` is no role a stage can give:
			.filter((role) => role.id !== guildId)
			.map((role) => [role.id, { managed: role.managed, belowBot: highest !== null && highest.comparePositionTo(role) > 0 }])
	);

	return {
		community: guild.features.includes(GuildFeature.Community),
		nativeOnboardingEnabled,
		hasMessage,
		roles: roleInfo,
		permissions: {
			manageRoles: permissions.has(PermissionFlagsBits.ManageRoles),
			kickMembers: permissions.has(PermissionFlagsBits.KickMembers),
			moderateMembers: permissions.has(PermissionFlagsBits.ModerateMembers)
		},
		captchaAvailable: OnboardingCaptchaAvailable
	};
}

/**
 * Whether Discord's own onboarding of a guild is on. A guild that cannot have it (no Community) answers with an error,
 * which reads as off.
 */
async function fetchNativeOnboardingEnabled(guildId: Snowflake): Promise<boolean> {
	try {
		return (await container.gatewayClient.api.guilds.getOnboarding(guildId)).enabled;
	} catch (error) {
		container.logger.debug(`[Onboarding] Could not read Discord's onboarding of ${guildId}, it reads as off:`, error);
		return false;
	}
}

/**
 * Whether the verification message of a guild is posted and still there.
 */
export async function hasOnboardingMessage(settings: Pick<OnboardingSettings, 'channelId' | 'messageId'>): Promise<boolean> {
	if (settings.channelId === null || settings.messageId === null) return false;

	const message = await resolveOnErrorCodes(
		container.gatewayClient.api.channels.getMessage(settings.channelId, settings.messageId),
		RESTJSONErrorCodes.UnknownMessage,
		RESTJSONErrorCodes.UnknownChannel,
		RESTJSONErrorCodes.MissingAccess
	);
	return message !== null;
}

/**
 * Why a channel cannot take the logs of the onboarding, or the verification message:
 * - `NotTextChannel`: it is not a text or an announcement channel of the guild.
 * - `MissingPermissions`: the bot lacks some of View Channel, Send Messages and Embed Links there.
 */
export type OnboardingChannelProblem =
	| { readonly code: 'NotTextChannel' }
	| { readonly code: 'MissingPermissions'; readonly missing: readonly string[] };

/**
 * Checks a channel the onboarding posts in.
 *
 * @returns The problem, `null` when the bot can post there.
 */
export async function getOnboardingChannelProblem(guildId: Snowflake, channelId: Snowflake): Promise<OnboardingChannelProblem | null> {
	const channel = await resolveOnErrorCodes(
		container.gatewayClient.channels.fetch(channelId),
		RESTJSONErrorCodes.UnknownChannel,
		RESTJSONErrorCodes.MissingAccess
	);
	if (channel === null || !('guildId' in channel) || channel.guildId !== guildId) return { code: 'NotTextChannel' };
	if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return { code: 'NotTextChannel' };

	const missing = await getMissingJoinGuardChannelPermissions(guildId, channelId);
	if (missing === null) return { code: 'NotTextChannel' };
	return missing.length === 0 ? null : { code: 'MissingPermissions', missing };
}
