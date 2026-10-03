import { readSettings } from '#lib/database';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { codeBlock } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/command-auto-delete show`, see the `command-auto-delete` parent command.
 */
@RegisterAsSubcommand('command-auto-delete', (builder) => applyLocalizedBuilder(builder, 'commands/management:managecommandautodeleteSubcommandShow'))
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const { commandsAutoDelete } = await readSettings(interaction.guildId);

		const list: string[] = [];
		for (const [channelId, time] of commandsAutoDelete) {
			const channel = await this.container.gatewayClient.channels.cache.get(channelId);
			// The stored value is in milliseconds, unlike what the prefix command displayed:
			if (channel && 'name' in channel)
				list.push(`${String(channel.name).padEnd(26)} :: ${translateKey(t, 'globals:durationValue', { value: time })}`);
		}

		if (list.length === 0) {
			return interaction.reply({
				content: translateKey(t, 'commands/management:manageCommandAutoDeleteShowEmpty'),
				flags: MessageFlags.Ephemeral
			});
		}

		const content = translateKey(t, 'commands/management:manageCommandAutoDeleteShow', { codeblock: codeBlock('asciidoc', list.join('\n')) });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}
