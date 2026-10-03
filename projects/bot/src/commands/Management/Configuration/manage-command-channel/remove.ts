import { CommandMatcher, writeSettingsTransaction } from '#lib/database';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention } from '@discordjs/formatters';
import type { TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ChannelType, MessageFlags } from 'discord-api-types/v10';

/**
 * `/command-channel remove`, see the `command-channel` parent command.
 */
@RegisterAsSubcommand('command-channel', (builder) =>
	applyLocalizedBuilder(builder, 'commands/management:manageCommandChannelSubcommandRemove')
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
		const entry = commandsDisabledInChannels[index];
		const commandIndex = entry?.commands.indexOf(command) ?? -1;
		if (commandIndex === -1) {
			const content = translateKey(t, 'commands/management:manageCommandChannelRemoveNotset', { channel: channelMention(channelId) });
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		const next =
			entry.commands.length === 1
				? commandsDisabledInChannels.toSpliced(index, 1)
				: commandsDisabledInChannels.with(index, { channel: channelId, commands: entry.commands.toSpliced(commandIndex, 1) });
		await trx.write({ commandsDisabledInChannels: next }).submitWithAudit(interaction.user.id);

		const content = translateKey(t, 'commands/management:manageCommandChannelRemove', { channel: channelMention(channelId), command });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}

interface Options {
	command: string;
	channel?: TransformedArguments.Channel;
}
