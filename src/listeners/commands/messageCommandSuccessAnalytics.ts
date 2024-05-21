import type { WolfCommand } from '#lib/structures';
import { Events as WolfEvents } from '#lib/types';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, type MessageCommandSuccessPayload } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({ event: Events.MessageCommandSuccess })
export class UserListener extends Listener<typeof Events.MessageCommandSuccess> {
	public run(payload: MessageCommandSuccessPayload) {
		const command = payload.command as WolfCommand;
		this.container.client.emit(WolfEvents.CommandUsageAnalytics, command.name, command.category);
	}
}
