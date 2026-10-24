import { AutoMessageRoot } from '#lib/automessages/render';
import { disableAutoMessage } from '#lib/automessages/store';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = AutoMessageRoot;

/**
 * `/automessage disable`, see the `automessage` parent command. Stops sending the message of a channel.
 */
@RegisterAsSubcommand('automessage', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:automessageDisable`).addChannelOption((option) =>
		applyLocalizedBuilder(option, `${Root}:optionsChannel`).setRequired(true)
	)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'automessage disable'>) {
		const t = getSupportedUserLanguageT(interaction);
		const disabled = await disableAutoMessage(interaction.guildId, options.channel.id);
		const key = disabled ? `${Root}:automessageDisabled` : `${Root}:automessageNotEnabled`;
		return interaction.reply({ content: translateKey(t, key, { channel: channelMention(options.channel.id) }), flags: MessageFlags.Ephemeral });
	}
}
