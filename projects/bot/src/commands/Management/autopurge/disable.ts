import { GuildTextChannelTypes } from '#utils/channelTypes';
import { CleanupRoot } from '#lib/moderation/cleanup/commands';
import { disableAutoPurge } from '#lib/moderation/cleanup/store';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { renderStatus } from '#utils/status';
import { channelMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

const Root = CleanupRoot;

/**
 * `/autopurge disable`, see the `autopurge` parent command. Stops purging a channel.
 */
@RegisterAsSubcommand('autopurge', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:autopurgeDisable`).addChannelOption((option) =>
		applyLocalizedBuilder(option, `${Root}:optionsChannel`)
			.addChannelTypes(...GuildTextChannelTypes)
			.setRequired(true)
	)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'autopurge disable'>) {
		const t = getSupportedUserLanguageT(interaction);
		const disabled = await disableAutoPurge(interaction.guildId, options.channel.id);
		const key = disabled ? `${Root}:autopurgeDisabled` : `${Root}:autopurgeNotEnabled`;
		return interaction.reply(renderStatus(disabled ? 'success' : 'info', translateKey(t, key, { channel: channelMention(options.channel.id) })));
	}
}
