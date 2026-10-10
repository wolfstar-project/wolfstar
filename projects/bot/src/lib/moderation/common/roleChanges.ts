import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * How long a change of a role the bot made is remembered, which is how long Discord may take to tell the bot about it.
 */
const OwnRoleChangeSeconds = 30;

function getKey(guildId: Snowflake, userId: Snowflake, roleId: Snowflake) {
	return `wolfstar:moderation:role-change:${guildId}:${userId}:${roleId}`;
}

/**
 * Remembers that the bot is about to take the role of a moderation action (the muted role, a restriction) from a member,
 * so the listener that sees the role go knows it was not taken by hand.
 *
 * @remarks It is in Redis: the command that takes the role may run on another process than the one the gateway tells.
 * Without a connection (the tests) nothing is remembered.
 */
export async function markOwnRoleChange(guildId: Snowflake, userId: Snowflake, roleId: Snowflake): Promise<void> {
	const { redis } = container;
	if (redis?.status !== 'ready') return;

	await redis.set(getKey(guildId, userId, roleId), '1', 'EX', OwnRoleChangeSeconds);
}

/**
 * Whether the bot took the role of a moderation action from a member, see {@linkcode markOwnRoleChange}. It answers
 * once: the mark is taken.
 */
export async function takeOwnRoleChange(guildId: Snowflake, userId: Snowflake, roleId: Snowflake): Promise<boolean> {
	const { redis } = container;
	if (redis?.status !== 'ready') return false;

	const mark = await redis.getdel(getKey(guildId, userId, roleId));
	return mark !== null;
}

/**
 * The roles a member lost between two states of them.
 *
 * @param previous - The roles the member had.
 * @param next - The roles the member has.
 */
export function getRemovedRoles(previous: readonly Snowflake[], next: readonly Snowflake[]): Snowflake[] {
	const kept = new Set(next);
	return previous.filter((id) => !kept.has(id));
}
