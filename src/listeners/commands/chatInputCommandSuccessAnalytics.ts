import type { WolfCommand } from '#lib/structures';
import { readSettings, readSettingsAuditLog } from '#lib/database';
import { Events as WolfEvents } from '#lib/types';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, type ChatInputCommandSuccessPayload } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandSuccess })
export class UserListener extends Listener<typeof Events.ChatInputCommandSuccess> {
	public async run(payload: ChatInputCommandSuccessPayload) {
		const command = payload.command as WolfCommand;
		const { interaction } = payload;
		this.container.client.emit(WolfEvents.CommandUsageAnalytics, command.name, command.category);

		if (!interaction.guildId || command.category === 'System') return;
		const settings = await readSettings(interaction.guildId);

		const subcommandGroup = interaction.options.getSubcommandGroup(false);
		const subcommand = interaction.options.getSubcommand(false);
		const parts = [interaction.commandName, subcommandGroup, subcommand].filter(Boolean) as string[];
		const commandName = parts.join(' ');

		void readSettingsAuditLog(settings)
			.command(interaction.user.id, {
				commandName,
				commandId: interaction.commandId,
				commandType: 'chat-input',
				channelId: interaction.channelId
			})
			.catch(() => null);
	}
}
