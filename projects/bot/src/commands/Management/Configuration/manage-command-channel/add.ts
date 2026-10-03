import { CommandMatcher, writeSettingsTransaction } from '#lib/database';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention } from '@discordjs/formatters';
import type { TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ChannelType, MessageFlags } from 'discord-api-types/v10';

/**
 * `/command-channel add`, see the `command-channel` parent command.
 */
@RegisterAsSubcommand('command-channel', (builder) =>
	applyLocalizedBuilder(builder, 'commands/management:manageCommandChannelSubcommandAdd')
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsCommand').setRequired(true).setAutocomplete(true))
		.addChannelOption((option) =>
			applyLocalizedBuilder(option, 'commands/shared:optionsChannel')
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
				.setRequired(false)
		)
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Options) {
		const t = getSupportedUserLanguageT(interaction);

		const command = CommandMatcher.resolve(options.command);
		if (command === null) {
			return interaction.reply({
				content: translateKey(t, 'arguments:command', { parameter: options.command }),
				flags: MessageFlags.Ephemeral
			});
		}

		const channelId = options.channel?.id ?? interaction.channel.id;

		using trx = await writeSettingsTransaction(interaction.guildId);

		const { commandsDisabledInChannels } = trx.settings;
		const index = commandsDisabledInChannels.findIndex((entry) => entry.channel === channelId);
		if (index === -1) {
			trx.write({ commandsDisabledInChannels: commandsDisabledInChannels.concat({ channel: channelId, commands: [command] }) });
		} else {
			const entry = commandsDisabledInChannels[index];
			if (entry.commands.includes(command)) {
				const content = translateKey(t, 'commands/management:manageCommandChannelAddAlreadyset');
				return interaction.reply({ content, flags: MessageFlags.Ephemeral });
			}

			trx.write({
				commandsDisabledInChannels: commandsDisabledInChannels.with(index, { channel: channelId, commands: entry.commands.concat(command) })
			});
		}

		await trx.submitWithAudit(interaction.user.id);

		const content = translateKey(t, 'commands/management:manageCommandChannelAdd', { channel: channelMention(channelId), command });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}

interface Options {
	command: string;
	channel?: TransformedArguments.Channel;
}
