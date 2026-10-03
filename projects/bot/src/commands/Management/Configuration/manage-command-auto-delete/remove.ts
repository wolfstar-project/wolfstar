import { writeSettingsTransaction, type CommandAutoDelete } from '#lib/database';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention } from '@discordjs/formatters';
import type { TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ChannelType, MessageFlags } from 'discord-api-types/v10';

/**
 * `/command-auto-delete remove`, see the `command-auto-delete` parent command.
 */
@RegisterAsSubcommand('command-auto-delete', (builder) =>
	applyLocalizedBuilder(builder, 'commands/management:managecommandautodeleteSubcommandRemove').addChannelOption((option) =>
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
		const { commandsAutoDelete } = trx.settings;
		const index = commandsAutoDelete.findIndex(([id]: CommandAutoDelete) => id === channelId);
		if (index === -1) {
			const content = translateKey(t, 'commands/management:manageCommandAutoDeleteRemoveNotset', { channel: channelMention(channelId) });
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		await trx.write({ commandsAutoDelete: commandsAutoDelete.toSpliced(index, 1) }).submitWithAudit(interaction.user.id);

		const content = translateKey(t, 'commands/management:manageCommandAutoDeleteRemove', { channel: channelMention(channelId) });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}

interface Options {
	channel?: TransformedArguments.Channel;
}
