import type { WolfCommand } from '#lib/structures';
import { Events as WolfEvents } from '#lib/types';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, type ContextMenuCommandSuccessPayload } from '@sapphire/framework';
import { recordCommandExecuteAudit } from './_command-log-shared.js';

@ApplyOptions<Listener.Options>({ event: Events.ContextMenuCommandSuccess })
export class UserListener extends Listener<typeof Events.ContextMenuCommandSuccess> {
	public run(payload: ContextMenuCommandSuccessPayload) {
		const command = payload.command as WolfCommand;
		const { interaction } = payload;
		this.container.client.emit(WolfEvents.CommandUsageAnalytics, command.name, command.category);

		if (!interaction.guildId || command.category === 'System') return;
		recordCommandExecuteAudit({
			guildId: interaction.guildId,
			actorId: interaction.user.id,
			commandName: interaction.commandName,
			commandType: 'context-menu',
			channelId: interaction.channelId
		});
	}
}
