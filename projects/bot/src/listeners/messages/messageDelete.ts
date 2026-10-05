import { isGuildMessage } from '#common';
import { Events } from '#lib/types';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Message } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('messageDelete')
export class UserListener extends EventGatewayListener<'messageDelete'> {
	public run(message: Message | null) {
		// The message is `null` when it was not cached, which is what a partial message was:
		if (message === null || message.partial || !isGuildMessage(message) || message.author.bot) return;
		this.container.client.emit(Events.GuildMessageDelete, message);
	}
}
