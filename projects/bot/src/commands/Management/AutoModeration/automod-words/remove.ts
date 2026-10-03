import { writeSettingsTransaction } from '#lib/database';
import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { remove as removeConfusables } from 'confusables';
import { MessageFlags } from 'discord-api-types/v10';

const Root = 'commands/auto-moderation';

/**
 * `/automod-words remove`, see the `automod-words` parent command.
 */
@RegisterAsSubcommand(AutoModerationRules.words.commandName, (builder) =>
	applyLocalizedBuilder(builder, `${Root}:removeName`, `${Root}:wordRemoveDescription`) //
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsWord`).setRequired(true).setMinLength(2).setMaxLength(32))
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Options) {
		const word = removeConfusables(options.word.toLowerCase());

		const t = getSupportedUserLanguageT(interaction);
		using trx = await writeSettingsTransaction(interaction.guildId);

		const index = trx.settings.selfmodWordsList.indexOf(word);
		if (index === -1) {
			return interaction.reply({ content: translateKey(t, `${Root}:wordRemoveNotFiltered`, { word }), flags: MessageFlags.Ephemeral });
		}

		await trx.write({ selfmodWordsList: trx.settings.selfmodWordsList.toSpliced(index, 1) }).submitWithAudit(interaction.user.id);
		return interaction.reply({ content: translateKey(t, `${Root}:editSuccess`), flags: MessageFlags.Ephemeral });
	}
}

interface Options {
	word: string;
}
