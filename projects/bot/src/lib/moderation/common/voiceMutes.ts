import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * How long a member is remembered as one with no voice mute in course. A voice mute that is made forgets it at once,
 * so this only bounds what a case that was written some other way would wait.
 */
const NotVoiceMutedSeconds = 600;

function getKey(guildId: Snowflake, userId: Snowflake) {
	return `wolfstar:moderation:not-voice-muted:${guildId}:${userId}`;
}

/**
 * What {@linkcode shouldRestoreVoiceMute} reads of a voice state.
 */
export interface VoiceStateLike {
	readonly channelId: Snowflake | null | undefined;
	readonly serverMute: boolean;
}

/**
 * Whether a voice state update is one after which a voice mute that is in course has to be applied again: the member
 * came into a voice channel, from none or from another one, and is not server muted.
 *
 * @remarks
 *
 * Discord only mutes a member who is connected, and forgets the mute of one who left the server, so the moment they
 * connect is the one the mute can be given back at. An update that keeps the member in the channel they were in (they
 * muted themselves, started a stream, were unmuted by a moderator) is not one: it is every other update of a voice
 * channel, and a mute a moderator took by hand is not fought until the member connects again.
 *
 * @param previous - The voice state the member had, `null` when it was not cached.
 * @param next - The voice state the member has.
 * @param bot - Whether the member is known to be a bot, which is left alone.
 */
export function shouldRestoreVoiceMute(previous: VoiceStateLike | null, next: VoiceStateLike, bot = false): boolean {
	if (bot) return false;
	if (next.channelId === null || next.channelId === undefined) return false;
	if (next.serverMute) return false;

	return (previous?.channelId ?? null) !== next.channelId;
}

/**
 * Whether a member was found to have no voice mute in course a moment ago, see {@linkcode markNotVoiceMuted}.
 */
export async function isKnownNotVoiceMuted(guildId: Snowflake, userId: Snowflake): Promise<boolean> {
	const { redis } = container;
	if (redis?.status !== 'ready') return false;

	const mark = await redis.exists(getKey(guildId, userId));
	return mark === 1;
}

/**
 * Remembers that a member has no voice mute in course, so the next times they connect to a voice channel the cases are
 * not read from the database again.
 *
 * @remarks It is in Redis: the command that voice mutes may run on another process than the one the gateway tells, and
 * it has to forget the mark. Without a connection (the tests) nothing is remembered and the cases are read every time.
 */
export async function markNotVoiceMuted(guildId: Snowflake, userId: Snowflake): Promise<void> {
	const { redis } = container;
	if (redis?.status !== 'ready') return;

	await redis.set(getKey(guildId, userId), '1', 'EX', NotVoiceMutedSeconds);
}

/**
 * Forgets that a member has no voice mute in course, see {@linkcode markNotVoiceMuted}: they were just voice muted.
 */
export async function forgetNotVoiceMuted(guildId: Snowflake, userId: Snowflake): Promise<void> {
	const { redis } = container;
	if (redis?.status !== 'ready') return;

	await redis.del(getKey(guildId, userId));
}
