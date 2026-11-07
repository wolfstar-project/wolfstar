import { removeModerationReason } from '#lib/moderation/reasons';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { inlineCode } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { MaximumModerationReasonAliasLength } from 'wolfstar-database';

/**
 * `/reasons remove`, see the `reasons` parent command. Removes a predefined reason, by its alias.
 */
@RegisterAsSubcommand('reasons', (builder) =>
	applyLocalizedBuilder(builder, 'commands/reasons:remove').addStringOption((option) =>
		applyLocalizedBuilder(option, 'commands/reasons:optionsAlias')
			.setRequired(true)
			.setMaxLength(MaximumModerationReasonAliasLength)
			.setAutocomplete(true)
	)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'reasons remove'>) {
		const t = getSupportedUserLanguageT(interaction);
		const removed = await removeModerationReason(interaction.guildId, options.alias);
		const key = removed ? 'commands/reasons:removed' : 'commands/reasons:notFound';
		return interaction.reply({
			content: translateKey(t, key, { alias: inlineCode(options.alias.trim().toLowerCase()) }),
			flags: MessageFlags.Ephemeral,
			allowed_mentions: { parse: [] }
		});
	}
}
