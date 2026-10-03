import { readSettingsWordFilterRegExp, writeSettingsTransaction, type ReadonlyGuildData } from '#lib/database';
import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { IncomingType, OutgoingType, type WorkerManager } from '#lib/moderation/workers';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { remove as removeConfusables } from 'confusables';
import { MessageFlags } from 'discord-api-types/v10';

const Root = 'commands/auto-moderation';

/**
 * `/automod-words add`, see the `automod-words` parent command.
 */
@RegisterAsSubcommand(AutoModerationRules.words.commandName, (builder) =>
	applyLocalizedBuilder(builder, `${Root}:addName`, `${Root}:wordAddDescription`) //
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsWord`).setRequired(true).setMinLength(2).setMaxLength(32))
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Options) {
		const word = removeConfusables(options.word.toLowerCase());

		const t = getSupportedUserLanguageT(interaction);
		using trx = await writeSettingsTransaction(interaction.guildId);
		if (await this.#hasWord(trx.settings, word)) {
			return interaction.reply({ content: translateKey(t, `${Root}:wordAddFiltered`, { word }), flags: MessageFlags.Ephemeral });
		}

		await trx.write({ selfmodWordsList: trx.settings.selfmodWordsList.concat(word) }).submitWithAudit(interaction.user.id);
		return interaction.reply({ content: translateKey(t, `${Root}:editSuccess`), flags: MessageFlags.Ephemeral });
	}

	/**
	 * Checks whether a word is already filtered, either as an entry of the list or because the regular expression that
	 * is compiled out of the list matches it.
	 */
	async #hasWord(settings: ReadonlyGuildData, word: string) {
		const words = settings.selfmodWordsList;
		if (words.includes(word)) return true;

		const regExp = readSettingsWordFilterRegExp(settings);
		if (regExp === null) return false;

		try {
			// `container.workers` is not declared by the V7 container yet, it is only there once the worker manager is started:
			const { workers } = this.container as unknown as { workers?: WorkerManager };
			// The regular expression is global, so a copy keeps its `lastIndex` out of the shared one:
			if (workers === undefined) return new RegExp(regExp.source, regExp.flags.replace('g', '')).test(word);

			const result = await workers.send({ type: IncomingType.RunRegExp, content: word, regExp });
			return result.type === OutgoingType.RegExpMatch;
		} catch {
			return false;
		}
	}
}

interface Options {
	word: string;
}
