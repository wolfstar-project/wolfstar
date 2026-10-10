import { Events } from '#lib/types';
import { canReadMessages, isGuildBasedChannel } from '@wolfstar/http-framework-utilities/gateway';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { MessageReaction, MessageReactionEventDetails, User } from '@wolfstar/plugin-gateway';
import type { GatewayMessageReactionRemoveDispatchData } from 'discord-api-types/v10';

@RegisterAsGatewayListener('messageReactionRemove')
export class UserListener extends EventGatewayListener<'messageReactionRemove'> {
	public async run(reaction: MessageReaction, _user: User | null, details: MessageReactionEventDetails) {
		const channel = await this.container.gatewayClient.channels.resolve(reaction.channelId);
		if (!channel || !isGuildBasedChannel(channel) || !('guildId' in channel) || !(await canReadMessages(channel))) return;

		// The gateway event has no raw payload, so the data of the dispatch is built from what it parsed out of it:
		const data: GatewayMessageReactionRemoveDispatchData = {
			user_id: details.userId,
			channel_id: reaction.channelId,
			message_id: reaction.messageId,
			guild_id: channel.guildId ?? undefined,
			emoji: { id: reaction.emoji.id, name: reaction.emoji.name, animated: reaction.emoji.animated },
			burst: details.burst,
			type: details.type
		};
		this.container.client.emit(Events.RawReactionRemove, channel, data);
	}
}
