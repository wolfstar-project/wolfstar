import { withSharedLock } from '#utils/locks';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * Runs a function while holding the lock of the nickname of a member, which `/setnickname` and the dehoisting take
 * around what they read and write, so a sticky nickname a moderator sets is never overwritten by a dehoist that read
 * the member before it.
 *
 * @param guildId - The ID of the guild.
 * @param userId - The ID of the member.
 * @param callback - What reads and writes the nickname.
 */
export function withNicknameLock<T>(guildId: Snowflake, userId: Snowflake, callback: () => Promise<T>): Promise<T> {
	return withSharedLock(`nickname:${guildId}:${userId}`, callback);
}
