import { GuildTextChannelTypes } from '#utils/channelTypes';
import { CleanupRoot } from '#lib/moderation/cleanup/commands';
import { disableAutoDelete } from '#lib/moderation/cleanup/store';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { renderStatus } from '#utils/status';
import { channelMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

const Root = CleanupRoot;

/**
 * `/autodelete disable`, see the `autodelete` parent command. Stops deleting the messages of a channel.
 */
@RegisterAsSubcommand('autodelete', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:autodeleteDisable`).addChannelOption((option) =>
		applyLocalizedBuilder(option, `${Root}:optionsChannel`)
			.addChannelTypes(...GuildTextChannelTypes)
			.setRequired(true)
	)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'autodelete disable'>) {
		const t = getSupportedUserLanguageT(interaction);
		const disabled = await disableAutoDelete(interaction.guildId, options.channel.id);
		const key = disabled ? `${Root}:autodeleteDisabled` : `${Root}:autodeleteNotEnabled`;
		return interaction.reply(renderStatus(disabled ? 'success' : 'info', translateKey(t, key, { channel: channelMention(options.channel.id) })));
	}
}
