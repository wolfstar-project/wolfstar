import { Events } from '#lib/types';
import { getEmojiString } from '#utils/functions';
import { LongLivingReactionCollector, type LLRCData } from '#utils/LongLivingReactionCollector';
import { canReadMessages, isGuildBasedChannel } from '@wolfstar/http-framework-utilities/gateway';
import { EventGatewayListener, GuildEmoji, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { MessageReaction, MessageReactionEventDetails, User } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('messageReactionAdd')
export class UserListener extends EventGatewayListener<'messageReactionAdd'> {
	public async run(reaction: MessageReaction, _user: User | null, details: MessageReactionEventDetails) {
		const channel = await this.container.gatewayClient.channels.resolve(reaction.channelId);
		if (!channel || !isGuildBasedChannel(channel) || !('guildId' in channel) || !channel.guildId || !(await canReadMessages(channel))) return;

		// The emoji of the guild is only known when it is cached, the reaction itself carries its id, name and animated:
		const { emoji } = reaction;
		const guildEmoji = emoji instanceof GuildEmoji ? emoji : null;
		const data: LLRCData = {
			channelId: channel.id,
			emoji: {
				animated: emoji.animated ?? false,
				id: emoji.id,
				managed: guildEmoji?.managed ?? null,
				name: emoji.name,
				requireColons: guildEmoji?.requiresColons ?? null,
				roles: guildEmoji ? [...guildEmoji.roleIds] : null,
				user: { id: details.userId }
			},
			guildId: channel.guildId,
			messageId: reaction.messageId,
			userId: details.userId
		};

		LongLivingReactionCollector.feed(data);

		const serialized = getEmojiString(data.emoji);
		if (serialized === null) return;

		this.container.client.emit(Events.RawReactionAdd, data, serialized);
	}
}
