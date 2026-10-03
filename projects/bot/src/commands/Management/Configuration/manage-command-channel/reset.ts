import { writeSettingsTransaction } from '#lib/database';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention } from '@discordjs/formatters';
import type { TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ChannelType, MessageFlags } from 'discord-api-types/v10';

/**
 * `/command-channel reset`, see the `command-channel` parent command.
 */
@RegisterAsSubcommand('command-channel', (builder) =>
	applyLocalizedBuilder(builder, 'commands/management:manageCommandChannelSubcommandReset').addChannelOption((option) =>
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

		using trx = await writeSettingsTransaction(interaction.guildId);

		const { commandsDisabledInChannels } = trx.settings;
		const index = commandsDisabledInChannels.findIndex((entry) => entry.channel === channelId);
		if (index === -1) {
			const content = translateKey(t, 'commands/management:manageCommandChannelResetEmpty');
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		await trx.write({ commandsDisabledInChannels: commandsDisabledInChannels.toSpliced(index, 1) }).submitWithAudit(interaction.user.id);

		const content = translateKey(t, 'commands/management:manageCommandChannelReset', { channel: channelMention(channelId) });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}

interface Options {
	channel?: TransformedArguments.Channel;
}
