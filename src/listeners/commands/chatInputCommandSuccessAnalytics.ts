import type { WolfCommand } from '#lib/structures';
import { readSettingsAuditLog, readSettingsCached } from '#lib/database';
import { Events as WolfEvents } from '#lib/types';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, type ChatInputCommandSuccessPayload } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandSuccess })
export class UserListener extends Listener<typeof Events.ChatInputCommandSuccess> {
	public run(payload: ChatInputCommandSuccessPayload) {
		const command = payload.command as WolfCommand;
		const { interaction } = payload;
		this.container.client.emit(WolfEvents.CommandUsageAnalytics, command.name, command.category);

		if (!interaction.guildId || command.category === 'System') return;
		const settings = readSettingsCached(interaction.guildId);
		if (!settings) return;
		void readSettingsAuditLog(settings)
			.command(interaction.user.id, {
				commandName: interaction.commandName,
				commandType: 'chat-input',
				channelId: interaction.channelId
			})
			.catch(() => null);
	}
}
