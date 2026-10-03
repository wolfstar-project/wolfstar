import { readSettings } from '#lib/database';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention } from '@discordjs/formatters';
import type { TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ChannelType, MessageFlags } from 'discord-api-types/v10';

/**
 * `/command-channel show`, see the `command-channel` parent command.
 */
@RegisterAsSubcommand('command-channel', (builder) =>
	applyLocalizedBuilder(builder, 'commands/management:manageCommandChannelSubcommandShow').addChannelOption((option) =>
		applyLocalizedBuilder(option, 'commands/shared:optionsChannel')
			.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
			.setRequired(false)
	)
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Options) {
		const t = getSupportedUserLanguageT(interaction);
		const channelId = options.channel?.id ?? interaction.channel.id;

		const { commandsDisabledInChannels } = await readSettings(interaction.guildId);
		const entry = commandsDisabledInChannels.find((entry) => entry.channel === channelId);
		if (!entry?.commands.length) {
			return interaction.reply({
				content: translateKey(t, 'commands/management:manageCommandChannelShowEmpty'),
				flags: MessageFlags.Ephemeral
			});
		}

		const content = translateKey(t, 'commands/management:manageCommandChannelShow', {
			channel: channelMention(channelId),
			commands: `\`${entry.commands.join('` | `')}\``
		});
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}

interface Options {
	channel?: TransformedArguments.Channel;
}
