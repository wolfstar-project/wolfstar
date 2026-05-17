import type { WolfCommand } from '#lib/structures';
import { Events as WolfEvents } from '#lib/types';
import { readSettingsAuditLog, readSettingsCached } from '#lib/database';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, type ContextMenuCommandSuccessPayload } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({ event: Events.ContextMenuCommandSuccess })
export class UserListener extends Listener<typeof Events.ContextMenuCommandSuccess> {
	public run(payload: ContextMenuCommandSuccessPayload) {
		const command = payload.command as WolfCommand;
		const { interaction } = payload;
		this.container.client.emit(WolfEvents.CommandUsageAnalytics, command.name, command.category);

		if (!interaction.guildId || command.category === 'System') return;
		const settings = readSettingsCached(interaction.guildId);
		if (!settings) return;
		void readSettingsAuditLog(settings)
			.command(interaction.user.id, {
				commandName: interaction.commandName,
				commandType: 'context-menu',
				channelId: interaction.channelId
			})
			.catch(() => null);
	}
}
