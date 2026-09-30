import { Events } from '#lib/types/Enums';
import { Listener } from '@sapphire/framework';
import type { Message } from 'discord.js';

export class UserListener extends Listener {
	public run(message: Message) {
		if (message.partial || !message.inGuild() || message.author.bot) return;
		this.container.gatewayClient.emit(Events.GuildMessageDelete, message);
	}
}
