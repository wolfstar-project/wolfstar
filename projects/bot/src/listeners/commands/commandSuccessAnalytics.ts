import { CommandMatcher, readSettings, readSettingsAuditLog } from '#lib/database';
import { Events } from '#lib/types';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener, type ClientEventCommandContext } from '@wolfstar/http-framework';
import { ApplicationCommandType } from 'discord-api-types/v10';
import { getSubcommandGroupName, getSubcommandName } from './_command-log-shared.js';

@ApplyOptions<Listener.Options>({ emitter: 'client', event: 'commandSuccess' })
export class UserListener extends Listener {
	public async run(context: ClientEventCommandContext) {
		const { command, interaction } = context;
		const category = CommandMatcher.getCategory(command);
		this.container.client.emit(Events.CommandUsageAnalytics, command.name, category);

		if (!interaction.guild_id || category === 'System') return;
		const settings = await readSettings(interaction.guild_id);
		const userId = (interaction.member?.user ?? interaction.user)!.id;

		if (interaction.data.type === ApplicationCommandType.ChatInput) {
			const subcommandGroup = getSubcommandGroupName(interaction);
			const subcommand = getSubcommandName(interaction);
			const parts = [interaction.data.name, subcommandGroup, subcommand].filter(Boolean) as string[];
			const commandName = parts.join(' ');

			void readSettingsAuditLog(settings)
				.command(userId, {
					commandName,
					commandId: interaction.data.id,
					commandType: 'chat-input',
					channelId: interaction.channel.id
				})
				.catch(() => null);
			return;
		}

		void readSettingsAuditLog(settings)
			.command(userId, {
				commandName: interaction.data.name,
				commandType: 'context-menu',
				channelId: interaction.channel.id
			})
			.catch(() => null);
	}
}
