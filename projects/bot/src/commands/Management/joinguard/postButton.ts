import { postJoinGuardButton } from '#lib/moderation/joinguard/button';
import { JoinGuardRoot } from '#lib/moderation/joinguard/commands';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention, inlineCode } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = JoinGuardRoot;

/**
 * `/joinguard post-button`, see the `joinguard` parent command. Posts the checkpoint button in the checkpoint channel,
 * or edits the one the bot posted when it is still there.
 */
@RegisterAsSubcommand('joinguard', (builder) => applyLocalizedBuilder(builder, `${Root}:postButton`))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
		const result = await postJoinGuardButton(interaction.guildId, interaction.user.id);

		const content = result.ok
			? translateKey(t, result.value.edited ? `${Root}:postButtonEdited` : `${Root}:postButtonPosted`, {
					channel: channelMention(result.value.channelId)
				})
			: result.error.code === 'NoChannel'
				? translateKey(t, `${Root}:postButtonNoChannel`, { command: inlineCode('/settings server') })
				: translateKey(t, `${Root}:postButtonFailed`, { error: result.error.detail });
		return deferred.update({ content, allowed_mentions: { parse: [] } });
	}
}
