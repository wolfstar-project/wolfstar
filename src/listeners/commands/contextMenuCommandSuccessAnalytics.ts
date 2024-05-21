import type { WolfCommand } from '#lib/structures';
import { Events as WolfEvents } from '#lib/types';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, type ContextMenuCommandSuccessPayload } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({ event: Events.ContextMenuCommandSuccess })
export class UserListener extends Listener<typeof Events.ContextMenuCommandSuccess> {
	public run(payload: ContextMenuCommandSuccessPayload) {
		const command = payload.command as WolfCommand;
		this.container.client.emit(WolfEvents.CommandUsageAnalytics, command.name, command.category);
	}
}
