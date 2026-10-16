import { broadcastShardMessage, onShardMessage } from '#lib/sharder/messages';
import { Collection } from '@discordjs/collection';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import { deleteRoleMessage, fetchRoleMessages, MaximumRoleMessages, setRoleMessage, type RoleMessage } from 'wolfstar-database';

/**
 * The role messages of each guild, which every change of the roles of a member is checked against.
 */
const cache = new Collection<Snowflake, readonly RoleMessage[]>();

/**
 * Thrown when a guild already has the most role messages it can have.
 */
export class RoleMessageLimitError extends Error {
	public constructor(public readonly maximum: number) {
		super(`Role message limit reached: ${maximum}`);
	}
}

/**
 * Reads the role messages of a guild, from the cache after the first time.
 */
export async function readRoleMessages(guildId: Snowflake): Promise<readonly RoleMessage[]> {
	const cached = cache.get(guildId);
	if (cached) return cached;

	const messages = await fetchRoleMessages(container.prisma, guildId);
	cache.set(guildId, messages);
	return messages;
}

// The messages are cached by every shard process, so a change in one of them makes the copies of the others stale.
onShardMessage('roleMessagesUpdate', ({ guildId }) => cache.delete(guildId));

function changed(guildId: Snowflake) {
	cache.delete(guildId);
	broadcastShardMessage({ type: 'roleMessagesUpdate', guildId });
}

/**
 * Sets the messages of a role, which replace the ones it had.
 *
 * @returns Whether they were new.
 * @throws {@linkcode RoleMessageLimitError} When the guild has the most it can have and this is one more.
 */
export async function addRoleMessage(guildId: Snowflake, data: RoleMessage): Promise<boolean> {
	const existing = await fetchRoleMessages(container.prisma, guildId);
	if (existing.length >= MaximumRoleMessages && !existing.some((entry) => entry.roleId === data.roleId)) {
		throw new RoleMessageLimitError(MaximumRoleMessages);
	}

	const created = await setRoleMessage(container.prisma, guildId, data);
	changed(guildId);
	return created;
}

/**
 * Removes the messages of a role.
 *
 * @returns Whether the guild had them.
 */
export async function removeRoleMessage(guildId: Snowflake, roleId: Snowflake): Promise<boolean> {
	const deleted = await deleteRoleMessage(container.prisma, guildId, roleId);
	if (deleted) changed(guildId);
	return deleted;
}
