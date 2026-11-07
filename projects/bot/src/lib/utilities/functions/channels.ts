import { UserError } from '@wolfstar/http-framework';
import { ChannelType } from 'discord-api-types/v10';

type ThreadChannelType = ChannelType.AnnouncementThread | ChannelType.PublicThread | ChannelType.PrivateThread;

/**
 * Asserts a text-based channel is not a thread channel.
 * @param channel The channel to assert, either a gateway channel or an API channel.
 * @returns The same channel, narrowed to exclude threads.
 */
export function assertNonThread<T extends { id: string; type: ChannelType }>(channel: T): Exclude<T, { type: ThreadChannelType }> {
	if (channel.type === ChannelType.AnnouncementThread || channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread) {
		throw new UserError({ identifier: 'assertions:expectedNonThreadChannel', context: { channel: `<#${channel.id}>` } });
	}

	return channel as Exclude<T, { type: ThreadChannelType }>;
}
