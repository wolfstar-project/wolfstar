import { Events } from '#lib/types';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Message } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('messageCreate')
export class UserListener extends EventGatewayListener<'messageCreate'> {
	public run(message: Message) {
		// If the message was sent by a webhook, return:
		if (message.webhookId !== null) return;

		// If the message was sent by the system, return:
		if (message.system) return;

		// If the message was sent by a bot, return:
		if (message.author.bot) return;

		// Emit UserMessage
		this.container.client.emit(Events.UserMessage, message);
	}
}
