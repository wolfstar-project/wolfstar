import { readSettings } from '#lib/database';
import { ModerationActions } from '#lib/moderation/actions/index';
import type { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import type { TypeVariation } from '#utils/moderationConstants';
import { isNullishOrZero } from '@sapphire/utilities';
import type { Guild } from '@wolfstar/plugin-gateway';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * What decides whether a mute is a Discord timeout: the settings of the guild that weigh on it.
 */
export interface MuteSettings {
	/** `moderation.mute-timeout`: a mute is a timeout whenever Discord takes its duration. */
	moderationMuteTimeout: boolean;
	/** The muted role of the guild, `null` when it has none. */
	rolesMuted: Snowflake | null;
}

/**
 * Who is muted, by whom, why and for how long: what a mute and a timeout both take.
 */
export type MuteOptions = Pick<ModerationAction.PartialOptions<TypeVariation.Timeout>, 'user' | 'moderator' | 'reason' | 'messageReference'> & {
	/** How long the mute lasts, in milliseconds; `null` for a permanent one. */
	duration?: number | null;
};

/**
 * Whether Discord takes a timeout of this duration: one with an end, within the shortest and the longest the timeout
 * action allows (28 days).
 *
 * @param duration - The duration of the mute, in milliseconds; `null` or `0` for a permanent one.
 */
export function fitsTimeout(duration: number | null | undefined): duration is number {
	const { minimumDuration, maximumDuration } = ModerationActions.timeout;
	return !isNullishOrZero(duration) && duration >= minimumDuration && duration <= maximumDuration;
}

/**
 * Whether a mute of a member is a Discord timeout instead of the muted role. It is one when Discord takes its duration
 * (see {@linkcode fitsTimeout}) and the guild either asked for it with `moderation.mute-timeout` or has no muted role,
 * which the mute would need and the bot does not set up on its own. A permanent mute, or one longer than 28 days, is
 * always the role.
 *
 * @param settings - The settings of the guild.
 * @param duration - The duration of the mute, in milliseconds; `null` or `0` for a permanent one.
 */
export function isMuteTimeout(settings: MuteSettings, duration: number | null | undefined): duration is number {
	return fitsTimeout(duration) && (settings.moderationMuteTimeout || settings.rolesMuted === null);
}

/**
 * Mutes a member the way the guild set it up: with a Discord timeout when {@linkcode isMuteTimeout} says so, with the
 * muted role otherwise. Its case is a Timeout or a Mute, after what was done.
 *
 * @param guild - The guild of the member.
 * @param options - The member, the reason and the duration of the mute.
 */
export async function applyMute(guild: Guild, options: MuteOptions) {
	const settings = await readSettings(guild);
	const { duration } = options;
	return isMuteTimeout(settings, duration)
		? ModerationActions.timeout.apply(guild, { ...options, duration })
		: ModerationActions.mute.apply(guild, options);
}
