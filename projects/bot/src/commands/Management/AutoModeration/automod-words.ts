import {
	readSettingsWordFilterRegExp,
	writeSettingsTransaction,
	type GuildDataValue,
	type ReadonlyGuildData,
	type SchemaDataKey
} from '#lib/database';
import { AutoModerationCommand } from '#lib/moderation/structures/AutoModerationCommand';
import { IncomingType, OutgoingType, type WorkerManager } from '#lib/moderation/workers';
import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { translateKey } from '#lib/structures/commands/utils';
import { addAutomaticFields } from '#utils/functions';
import { chatInputApplicationCommandMention, type SlashCommandSubcommandBuilder } from '@discordjs/builders';
import { inlineCode } from '@discordjs/formatters';
import { isNullishOrEmpty, type Awaitable } from '@sapphire/utilities';
import { ApplyOptions, container, type Command } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT, type TFunction } from '@wolfstar/plugin-i18next';
import { remove as removeConfusables } from 'confusables';
import { MessageFlags } from 'discord-api-types/v10';

const Root = 'commands/auto-moderation';

/**
 * The `words` auto-moderation command, which replaces the prefix `filter` and `filter-mode` commands: on top of the
 * `show`, `edit` and `reset` subcommands it has `add` and `remove` to manage the list of filtered words.
 */
@ApplyOptions<AutoModerationCommand.Options>({
	localizedNameKey: `${Root}:words`,
	resetKeys: [{ key: `${Root}:optionsKeyWords`, value: 'words' }],
	adderPropertyName: 'words',
	keyEnabled: 'selfmodWordsEnabled',
	keyOnInfraction: 'selfmodWordsSoftAction',
	keyPunishment: 'selfmodWordsHardAction',
	keyPunishmentDuration: 'selfmodWordsHardActionDuration',
	keyPunishmentThreshold: 'selfmodWordsThresholdMaximum',
	keyPunishmentThresholdPeriod: 'selfmodWordsThresholdDuration'
})
export class UserCommand extends AutoModerationCommand {
	public override registerApplicationCommands(registry: Command.Registry) {
		super.registerApplicationCommands(registry);
		registry
			.registerSubcommand((builder) => this.registerAddSubcommand(builder), 'chatInputRunAdd')
			.registerSubcommand((builder) => this.registerRemoveSubcommand(builder), 'chatInputRunRemove');
	}

	public async chatInputRunAdd(interaction: AutoModerationCommand.Interaction, options: UserCommand.WordArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const word = this.#getWord(options);

		const t = getSupportedUserLanguageT(interaction);
		using trx = await writeSettingsTransaction(interaction.guildId);
		if (await this.#hasWord(trx.settings, word)) {
			return interaction.reply({ content: translateKey(t, `${Root}:wordAddFiltered`, { word }), flags: MessageFlags.Ephemeral });
		}

		await trx.write({ selfmodWordsList: trx.settings.selfmodWordsList.concat(word) }).submitWithAudit(interaction.user.id);
		return interaction.reply({ content: translateKey(t, `${Root}:editSuccess`), flags: MessageFlags.Ephemeral });
	}

	public async chatInputRunRemove(interaction: AutoModerationCommand.Interaction, options: UserCommand.WordArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const word = this.#getWord(options);

		const t = getSupportedUserLanguageT(interaction);
		using trx = await writeSettingsTransaction(interaction.guildId);

		const index = trx.settings.selfmodWordsList.indexOf(word);
		if (index === -1) {
			return interaction.reply({ content: translateKey(t, `${Root}:wordRemoveNotFiltered`, { word }), flags: MessageFlags.Ephemeral });
		}

		await trx.write({ selfmodWordsList: trx.settings.selfmodWordsList.toSpliced(index, 1) }).submitWithAudit(interaction.user.id);
		return interaction.reply({ content: translateKey(t, `${Root}:editSuccess`), flags: MessageFlags.Ephemeral });
	}

	protected override showEnabled(t: TFunction, settings: ReadonlyGuildData) {
		const embed = super.showEnabled(t, settings);

		const words = settings.selfmodWordsList;
		if (isNullishOrEmpty(words)) {
			embed.addFields({
				name: translateKey(t, `${Root}:wordShowListTitleEmpty`),
				value: translateKey(t, `${Root}:wordShowListEmpty`, { command: this.#getAddMention() })
			});
		} else {
			addAutomaticFields(
				embed,
				translateKey(t, `${Root}:wordShowListTitle`, { count: words.length }),
				translateKey(t, `${Root}:wordShowList`, { words: words.map((word) => inlineCode(word)) })
			);
		}
		return embed;
	}

	protected registerAddSubcommand(subcommand: SlashCommandSubcommandBuilder) {
		return applyLocalizedBuilder(subcommand, `${Root}:addName`, `${Root}:wordAddDescription`) //
			.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsWord`).setRequired(true).setMinLength(2).setMaxLength(32));
	}

	protected registerRemoveSubcommand(subcommand: SlashCommandSubcommandBuilder) {
		return applyLocalizedBuilder(subcommand, `${Root}:removeName`, `${Root}:wordRemoveDescription`) //
			.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsWord`).setRequired(true).setMinLength(2).setMaxLength(32));
	}

	protected override resetGetKeyValuePairFallback(guildId: string, key: string): Awaitable<readonly [SchemaDataKey, GuildDataValue]> {
		if (key === 'words') return ['selfmodWordsList', []];
		return super.resetGetKeyValuePairFallback(guildId, key);
	}

	#getWord(options: UserCommand.WordArguments) {
		return removeConfusables(options.word.toLowerCase());
	}

	#getAddMention() {
		const id = this.registry?.getGlobalId() ?? null;
		return id === null ? `/${this.name} add` : chatInputApplicationCommandMention(this.name, 'add', id);
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
			const { workers } = container as unknown as { workers?: WorkerManager };
			// The regular expression is global, so a copy keeps its `lastIndex` out of the shared one:
			if (workers === undefined) return new RegExp(regExp.source, regExp.flags.replace('g', '')).test(word);

			const result = await workers.send({ type: IncomingType.RunRegExp, content: word, regExp });
			return result.type === OutgoingType.RegExpMatch;
		} catch {
			return false;
		}
	}
}

export namespace UserCommand {
	/**
	 * The options of the `add` and `remove` subcommands.
	 */
	export interface WordArguments {
		word: string;
	}
}
