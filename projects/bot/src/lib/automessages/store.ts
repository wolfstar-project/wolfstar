import { withSharedLock } from '#utils/locks';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import {
	deleteAutoMessage,
	fetchAutoMessage,
	fetchAutoMessages,
	MaximumAutoMessages,
	setAutoMessage,
	type AutoMessage,
	type AutoMessageData
} from 'wolfstar-database';

/**
 * Thrown when a guild already has the most automatic messages it can have.
 */
export class AutoMessageLimitError extends Error {
	public constructor(public readonly maximum: number) {
		super(`Automatic message limit reached: ${maximum}`);
	}
}

/**
 * Reads the automatic messages of a guild. They are read by the commands and by the task that sends them, not by every
 * message, so they are not cached.
 */
export function readAutoMessages(guildId: Snowflake): Promise<AutoMessage[]> {
	return fetchAutoMessages(container.prisma.orm, guildId);
}

/**
 * Reads the automatic message of a channel, `null` when it has none.
 */
export function readAutoMessage(guildId: Snowflake, channelId: Snowflake): Promise<AutoMessage | null> {
	return fetchAutoMessage(container.prisma.orm, guildId, channelId);
}

/**
 * Sends a message in a channel every interval from now on, which replaces the one the channel had. The first one is
 * one interval away.
 *
 * @throws {@linkcode AutoMessageLimitError} When the guild has the most automatic messages it can have and this is one
 * more.
 */
export async function enableAutoMessage(guildId: Snowflake, data: AutoMessageData): Promise<AutoMessage> {
	const { prisma } = container;
	// The count and the write are one step for every process, so two channels enabled at once do not both take the last slot:
	return withSharedLock(`automessages:${guildId}`, async () => {
		const existing = await fetchAutoMessages(prisma.orm, guildId);
		if (existing.length >= MaximumAutoMessages && !existing.some((message) => message.channelId === data.channelId)) {
			throw new AutoMessageLimitError(MaximumAutoMessages);
		}

		return setAutoMessage(prisma, guildId, data, Date.now() + data.interval);
	});
}

/**
 * Stops sending the automatic message of a channel.
 *
 * @returns Whether the channel had one.
 */
export function disableAutoMessage(guildId: Snowflake, channelId: Snowflake): Promise<boolean> {
	return deleteAutoMessage(container.prisma, guildId, channelId);
}
