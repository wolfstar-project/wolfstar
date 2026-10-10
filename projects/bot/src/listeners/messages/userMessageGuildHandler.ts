import { isGuildMessage } from '#common';
import { Events } from '#lib/types';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { Message } from '@wolfstar/plugin-gateway';

@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.UserMessage })
export class UserListener extends Listener {
	public run(message: Message) {
		if (isGuildMessage(message)) this.container.client.emit(Events.GuildUserMessage, message);
	}
}
