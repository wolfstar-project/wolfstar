import { CleanupRoot } from '#lib/moderation/cleanup/commands';
import { disableAutoDelete } from '#lib/moderation/cleanup/store';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = CleanupRoot;

/**
 * `/autodelete disable`, see the `autodelete` parent command. Stops deleting the messages of a channel.
 */
@RegisterAsSubcommand('autodelete', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:autodeleteDisable`).addChannelOption((option) =>
		applyLocalizedBuilder(option, `${Root}:optionsChannel`).setRequired(true)
	)
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'autodelete disable'>) {
		const t = getSupportedUserLanguageT(interaction);
		const disabled = await disableAutoDelete(interaction.guildId, options.channel.id);
		const key = disabled ? `${Root}:autodeleteDisabled` : `${Root}:autodeleteNotEnabled`;
		return interaction.reply({ content: translateKey(t, key, { channel: channelMention(options.channel.id) }), flags: MessageFlags.Ephemeral });
	}
}
