import { container } from '@wolfstar/http-framework';
import type { TypeVariation } from '#utils/moderationConstants';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * How long a change of a role the bot made is remembered, which is how long Discord may take to tell the bot about it.
 */
const OwnRoleChangeSeconds = 30;

/**
 * Whether the bot gave the role of a moderation action to a member, or took it from them.
 */
export type OwnRoleChange = 'add' | 'remove';

function getKey(guildId: Snowflake, userId: Snowflake, roleId: Snowflake, change: OwnRoleChange) {
	const key = `wolfstar:moderation:role-change:${guildId}:${userId}:${roleId}`;
	return change === 'add' ? `${key}:add` : key;
}

/**
 * Remembers that the bot is about to take the role of a moderation action (the muted role, a restriction) from a member,
 * or to give it to them, so the listener that sees the role go, or come, knows it was not done by hand.
 *
 * @remarks It is in Redis: the command that takes the role may run on another process than the one the gateway tells.
 * Without a connection (the tests) nothing is remembered.
 */
export async function markOwnRoleChange(guildId: Snowflake, userId: Snowflake, roleId: Snowflake, change: OwnRoleChange = 'remove'): Promise<void> {
	const { redis } = container;
	if (redis?.status !== 'ready') return;

	await redis.set(getKey(guildId, userId, roleId, change), '1', 'EX', OwnRoleChangeSeconds);
}

/**
 * Whether the bot took the role of a moderation action from a member, see {@linkcode markOwnRoleChange}. It answers
 * once: the mark is taken.
 */
export async function takeOwnRoleChange(
	guildId: Snowflake,
	userId: Snowflake,
	roleId: Snowflake,
	change: OwnRoleChange = 'remove'
): Promise<boolean> {
	const { redis } = container;
	if (redis?.status !== 'ready') return false;

	const mark = await redis.getdel(getKey(guildId, userId, roleId, change));
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

/**
 * The roles a member gained between two states of them.
 *
 * @param previous - The roles the member had.
 * @param next - The roles the member has.
 */
export function getAddedRoles(previous: readonly Snowflake[], next: readonly Snowflake[]): Snowflake[] {
	const had = new Set(previous);
	return next.filter((id) => !had.has(id));
}

/**
 * What {@linkcode getUsersInCourse} reads of a case.
 */
export interface CaseInCourse {
	readonly id: number;
	readonly type: TypeVariation;
	readonly userId: Snowflake;
	isArchived(): boolean;
	isCompleted(): boolean;
	isUndo(): boolean;
}

/**
 * The users an action is in course for: the ones whose latest case of its type is not its undo, nor one that ended.
 *
 * @param entries - The cases to look in.
 * @param type - The type of the action.
 */
export function getUsersInCourse(entries: Iterable<CaseInCourse>, type: TypeVariation): Snowflake[] {
	const latest = new Map<Snowflake, CaseInCourse>();
	for (const entry of entries) {
		if (entry.type !== type || entry.isArchived()) continue;

		const known = latest.get(entry.userId);
		if (known === undefined || entry.id > known.id) latest.set(entry.userId, entry);
	}

	return [...latest.values()].filter((entry) => !entry.isUndo() && !entry.isCompleted()).map((entry) => entry.userId);
}
