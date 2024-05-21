import type { WolfCommand } from '#lib/structures';
import { Events as WolfEvents } from '#lib/types';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, type ChatInputCommandSuccessPayload } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandSuccess })
export class UserListener extends Listener<typeof Events.ChatInputCommandSuccess> {
	public run(payload: ChatInputCommandSuccessPayload) {
		const command = payload.command as WolfCommand;
		this.container.client.emit(WolfEvents.CommandUsageAnalytics, command.name, command.category);
	}
}
