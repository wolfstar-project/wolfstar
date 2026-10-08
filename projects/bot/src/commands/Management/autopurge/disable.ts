import { CleanupRoot } from '#lib/moderation/cleanup/commands';
import { disableAutoPurge } from '#lib/moderation/cleanup/store';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention } from '@discordjs/formatters';
import type { CommandOptionsRegistry } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = CleanupRoot;

/**
 * `/autopurge disable`, see the `autopurge` parent command. Stops purging a channel.
 */
@RegisterAsSubcommand('autopurge', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:autopurgeDisable`).addChannelOption((option) =>
		applyLocalizedBuilder(option, `${Root}:optionsChannel`).setRequired(true)
	)
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: CommandOptionsRegistry['autopurge disable']) {
		const t = getSupportedUserLanguageT(interaction);
		const disabled = await disableAutoPurge(interaction.guildId, options.channel.id);
		const key = disabled ? `${Root}:autopurgeDisabled` : `${Root}:autopurgeNotEnabled`;
		return interaction.reply({ content: translateKey(t, key, { channel: channelMention(options.channel.id) }), flags: MessageFlags.Ephemeral });
	}
}
