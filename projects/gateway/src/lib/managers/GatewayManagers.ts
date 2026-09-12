import { ChannelManager } from './ChannelManager';
import { EmojiManager } from './EmojiManager';
import { GuildManager } from './GuildManager';
import { MemberManager } from './MemberManager';
import { MessageManager } from './MessageManager';
import { RoleManager } from './RoleManager';
import { StickerManager } from './StickerManager';
import type { REST } from '@discordjs/rest';
import type { Cache, MessageBroker } from 'wolfstar-shared';

/**
 * Aggregates every gateway manager behind a single facade, wiring each one to
 * the shared cache, message broker and REST client.
 */
export class GatewayManagers {
	public readonly guilds: GuildManager;
	public readonly channels: ChannelManager;
	public readonly roles: RoleManager;
	public readonly members: MemberManager;
	public readonly messages: MessageManager;
	public readonly emojis: EmojiManager;
	public readonly stickers: StickerManager;

	public constructor(cache: Cache, broker: MessageBroker, rest: REST) {
		this.guilds = new GuildManager(cache, broker, rest);
		this.channels = new ChannelManager(cache.channels, broker, rest);
		this.roles = new RoleManager(cache.roles, broker);
		this.members = new MemberManager(cache.members, broker, rest);
		this.messages = new MessageManager(cache.messages, broker);
		this.emojis = new EmojiManager(cache.emojis, broker);
		this.stickers = new StickerManager(cache.stickers, broker);
	}
}
