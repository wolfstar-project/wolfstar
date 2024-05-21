import { WolfLazyPaginatedMessage, WolfPaginatedMessage } from '#lib/structures';
import { Events, type GuildMessage } from '#lib/types';
import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({ event: Events.GuildMessageDelete })
export class UserListener extends Listener {
	public run(message: GuildMessage) {
		WolfPaginatedMessage.messages.get(message.id)?.collector?.stop();
		WolfLazyPaginatedMessage.messages.get(message.id)?.collector?.stop();
	}
}
