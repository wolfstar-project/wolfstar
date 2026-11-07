import { addModerationReason, ModerationReasonLimitError } from '#lib/moderation/reasons';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { inlineCode } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { MaximumModerationReasonAliasLength, MaximumModerationReasonLength } from 'wolfstar-database';

/**
 * `/reasons add`, see the `reasons` parent command. Defines a reason, or replaces the one with the same alias.
 */
@RegisterAsSubcommand('reasons', (builder) =>
	applyLocalizedBuilder(builder, 'commands/reasons:add')
		.addStringOption((option) =>
			applyLocalizedBuilder(option, 'commands/reasons:optionsAlias').setRequired(true).setMaxLength(MaximumModerationReasonAliasLength)
		)
		.addStringOption((option) =>
			applyLocalizedBuilder(option, 'commands/reasons:optionsReason').setRequired(true).setMaxLength(MaximumModerationReasonLength)
		)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'reasons add'>) {
		const t = getSupportedUserLanguageT(interaction);
		const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });

		try {
			const created = await addModerationReason(interaction.guildId, { alias: options.alias, reason: options.reason });
			const key = created ? 'commands/reasons:added' : 'commands/reasons:replaced';
			return reply(translateKey(t, key, { alias: inlineCode(options.alias.trim().toLowerCase()) }));
		} catch (error) {
			if (error instanceof ModerationReasonLimitError) return reply(translateKey(t, 'commands/reasons:limit', { maximum: error.maximum }));
			throw error;
		}
	}
}
