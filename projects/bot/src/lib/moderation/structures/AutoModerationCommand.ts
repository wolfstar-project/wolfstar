import {
	getConfigurableKeys,
	readSettings,
	readSettingsAdder,
	writeSettingsTransaction,
	type AdderKey,
	type AutoModerationHardAction,
	type GuildData,
	type GuildDataValue,
	type GuildSettingsOfType,
	type ReadonlyGuildData,
	type SchemaDataKey
} from '#lib/database';
import type { Adder } from '#lib/database/utils/Adder';
import { AutoModerationOnInfraction } from '#lib/moderation/structures/AutoModerationOnInfraction';
import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction, type TranslationKey } from '#lib/structures/commands/utils';
import { Colors, Emojis } from '#utils/constants';
import { resolveTimeSpan } from '#utils/resolvers';
import { EmbedBuilder, strikethrough, type SlashCommandBuilder, type SlashCommandSubcommandBuilder } from '@discordjs/builders';
import { isNullish, isNullishOrEmpty, isNullishOrZero, type Awaitable } from '@sapphire/utilities';
import { Command } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT, type TFunction } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

const Root = 'commands/auto-moderation';

/**
 * The base class of the auto-moderation rule commands (`attachments`, `capitals`, `invites`, ...), which are a slash
 * command with the `show`, `edit` and `reset` subcommands.
 *
 * The command registers itself from {@linkcode AutoModerationCommand.registerApplicationCommands}, reading the
 * {@linkcode AutoModerationCommand.Options | options} that are given to the constructor, so a subclass does not use
 * `@RegisterCommand`. Piece options are applied with `@ApplyOptions`:
 *
 * @example
 * ```typescript
 * \@ApplyOptions<AutoModerationCommand.Options>({
 * 	localizedNameKey: 'commands/auto-moderation:attachments',
 * 	adderPropertyName: 'attachments',
 * 	keyEnabled: 'selfmodAttachmentsEnabled',
 * 	keyOnInfraction: 'selfmodAttachmentsSoftAction',
 * 	keyPunishment: 'selfmodAttachmentsHardAction',
 * 	keyPunishmentDuration: 'selfmodAttachmentsHardActionDuration',
 * 	keyPunishmentThreshold: 'selfmodAttachmentsThresholdMaximum',
 * 	keyPunishmentThresholdPeriod: 'selfmodAttachmentsThresholdDuration'
 * })
 * export class UserCommand extends AutoModerationCommand {}
 * ```
 *
 * Extra subcommands (for example the `words` of the filter) are added by overriding
 * {@linkcode AutoModerationCommand.registerApplicationCommands}, calling `super` first.
 *
 * @remarks
 *
 * The permission level is {@linkcode CommandPermissionLevel.Administrator}, plus `ManageGuild` as the default member
 * permission of the registered command.
 */
export abstract class AutoModerationCommand extends Command<AutoModerationCommand.Options> {
	protected readonly resetKeys: readonly AutoModerationCommand.OptionsResetKey[];
	protected readonly adderPropertyName: AdderKey;
	protected readonly keyEnabled: GuildSettingsOfType<boolean>;
	protected readonly keyOnInfraction: GuildSettingsOfType<number>;
	protected readonly keyPunishment: GuildSettingsOfType<AutoModerationHardAction>;
	protected readonly keyPunishmentDuration: GuildSettingsOfType<bigint | number | null>;
	protected readonly keyPunishmentThreshold: GuildSettingsOfType<number | null>;
	protected readonly keyPunishmentThresholdPeriod: GuildSettingsOfType<number | null>;

	readonly #punishmentDurationMinimum: number;
	readonly #punishmentDurationMaximum: number;
	readonly #punishmentThresholdDurationMinimum: number;
	readonly #punishmentThresholdDurationMaximum: number;

	public constructor(context: AutoModerationCommand.LoaderContext, options: AutoModerationCommand.Options) {
		super(context, options);

		this.resetKeys = options.resetKeys ?? [];
		this.adderPropertyName = options.adderPropertyName;
		this.keyEnabled = options.keyEnabled;
		this.keyOnInfraction = options.keyOnInfraction;
		this.keyPunishment = options.keyPunishment;
		this.keyPunishmentDuration = options.keyPunishmentDuration;
		this.keyPunishmentThreshold = options.keyPunishmentThreshold;
		this.keyPunishmentThresholdPeriod = options.keyPunishmentThresholdPeriod;

		const configurableKeys = getConfigurableKeys();
		const punishmentDuration = configurableKeys.get(this.keyPunishmentDuration)!;
		this.#punishmentDurationMinimum = punishmentDuration.minimum!;
		this.#punishmentDurationMaximum = punishmentDuration.maximum!;

		const punishmentThresholdDuration = configurableKeys.get(this.keyPunishmentThresholdPeriod)!;
		this.#punishmentThresholdDurationMinimum = punishmentThresholdDuration.minimum!;
		this.#punishmentThresholdDurationMaximum = punishmentThresholdDuration.maximum!;
	}

	/**
	 * Registers the chat input command, and the `show`, `edit` and `reset` subcommands.
	 *
	 * @remarks
	 *
	 * The base {@linkcode Command} constructor calls this before any field of the subclasses is initialized, which is
	 * why it only reads `this.options`.
	 */
	public override registerApplicationCommands(registry: Command.Registry) {
		const { options } = this;
		registry
			.registerChatInputCommand((builder) => this.registerCommand(builder, options))
			.registerSubcommand((builder) => this.registerShowSubcommand(builder), 'chatInputRunShow')
			.registerSubcommand((builder) => this.registerEditSubcommand(builder, options), 'chatInputRunEdit')
			.registerSubcommand((builder) => this.registerResetSubcommand(builder, options), 'chatInputRunReset');
	}

	public async chatInputRunShow(interaction: AutoModerationCommand.Interaction) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const settings = await readSettings(interaction.guildId);

		const t = getSupportedUserLanguageT(interaction);
		const embed = settings[this.keyEnabled] //
			? this.showEnabled(t, settings)
			: this.showDisabled(t);
		return interaction.reply({ embeds: [embed.toJSON()], flags: MessageFlags.Ephemeral });
	}

	public async chatInputRunEdit(interaction: AutoModerationCommand.Interaction, options: AutoModerationCommand.EditArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);
		const valuePunishmentDuration = this.#getDuration(
			t,
			options['punishment-duration'],
			this.#punishmentDurationMinimum,
			this.#punishmentDurationMaximum
		);
		const valuePunishmentThresholdDuration = this.#getDuration(
			t,
			options['threshold-period'],
			this.#punishmentThresholdDurationMinimum,
			this.#punishmentThresholdDurationMaximum
		);
		if (typeof valuePunishmentDuration === 'object' || typeof valuePunishmentThresholdDuration === 'object') {
			const error = typeof valuePunishmentDuration === 'object' ? valuePunishmentDuration : valuePunishmentThresholdDuration;
			return interaction.reply({ content: (error as { error: string }).error, flags: MessageFlags.Ephemeral });
		}

		using trx = await writeSettingsTransaction(interaction.guildId);
		const settings = trx.settings;

		const valueOnInfraction = this.#getInfraction(options, settings[this.keyOnInfraction]);

		const pairs: [SchemaDataKey, GuildDataValue][] = [];
		if (!isNullish(options.enabled)) pairs.push([this.keyEnabled, options.enabled]);
		if (!isNullish(valueOnInfraction)) pairs.push([this.keyOnInfraction, valueOnInfraction]);
		if (!isNullish(options.punishment)) pairs.push([this.keyPunishment, options.punishment]);
		if (!isNullish(valuePunishmentDuration)) pairs.push([this.keyPunishmentDuration, valuePunishmentDuration]);
		if (!isNullish(options.threshold)) pairs.push([this.keyPunishmentThreshold, options.threshold]);
		if (!isNullish(valuePunishmentThresholdDuration)) pairs.push([this.keyPunishmentThresholdPeriod, valuePunishmentThresholdDuration]);

		await trx.write(Object.fromEntries(pairs) as Partial<GuildData>).submitWithAudit(interaction.user.id);

		const content = translateKey(t, `${Root}:editSuccess`);
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	public async chatInputRunReset(interaction: AutoModerationCommand.Interaction, options: AutoModerationCommand.ResetArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const [key, value] = await this.resetGetKeyValuePair(interaction.guildId, options.key as ResetKey);
		using trx = await writeSettingsTransaction(interaction.guildId);
		await trx.write({ [key]: value } as Partial<GuildData>).submitWithAudit(interaction.user.id);

		const t = getSupportedUserLanguageT(interaction);
		const content = translateKey(t, `${Root}:editSuccess`);
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	protected async resetGetKeyValuePair(guildId: string, key: ResetKey): Promise<readonly [SchemaDataKey, GuildDataValue]> {
		switch (key) {
			case 'enabled':
				return [this.keyEnabled, false];
			case 'alert':
				return [this.keyOnInfraction, await this.resetGetOnInfractionFlags(guildId, AutoModerationOnInfraction.flags.Alert)];
			case 'log':
				return [this.keyOnInfraction, await this.resetGetOnInfractionFlags(guildId, AutoModerationOnInfraction.flags.Log)];
			case 'delete':
				return [this.keyOnInfraction, await this.resetGetOnInfractionFlags(guildId, AutoModerationOnInfraction.flags.Delete)];
			case 'punishment':
				return [this.keyPunishment, this.resetGetValue(this.keyPunishment)];
			case 'punishment-duration':
				return [this.keyPunishmentDuration, this.resetGetValue(this.keyPunishmentDuration)];
			case 'threshold':
				return [this.keyPunishmentThreshold, this.resetGetValue(this.keyPunishmentThreshold)];
			case 'threshold-duration':
				return [this.keyPunishmentThresholdPeriod, this.resetGetValue(this.keyPunishmentThresholdPeriod)];
			default:
				return this.resetGetKeyValuePairFallback(guildId, key);
		}
	}

	protected resetGetKeyValuePairFallback(guildId: string, key: string): Awaitable<readonly [SchemaDataKey, GuildDataValue]>;
	protected resetGetKeyValuePairFallback(): never {
		throw new Error('Unreachable');
	}

	protected resetGetValue<const Key extends SchemaDataKey>(key: Key): GuildData[Key] {
		return getConfigurableKeys().get(key)!.default as GuildData[Key];
	}

	protected async resetGetOnInfractionFlags(guildId: string, bit: number) {
		const settings = await readSettings(guildId);
		const bitfield = settings[this.keyOnInfraction];
		return AutoModerationOnInfraction.difference(bitfield, bit);
	}

	protected showDisabled(t: TFunction) {
		return new EmbedBuilder() //
			.setColor(Colors.Red)
			.setTitle(translateKey(t, `${Root}:showDisabled`));
	}

	protected showEnabled(t: TFunction, settings: ReadonlyGuildData) {
		const embed = new EmbedBuilder() //
			.setColor(Colors.Green)
			.setTitle(translateKey(t, `${Root}:showEnabled`))
			.setDescription(this.showEnabledOnInfraction(t, settings[this.keyOnInfraction]));

		const punishment = settings[this.keyPunishment];
		if (!isNullish(punishment)) {
			embed.addFields({
				name: translateKey(t, `${Root}:showPunishmentTitle`),
				value: this.showEnabledOnPunishment(
					t,
					punishment,
					settings[this.keyPunishmentDuration],
					readSettingsAdder(settings, this.adderPropertyName)
				)
			});
		}

		return embed;
	}

	protected showEnabledOnInfraction(t: TFunction, value: number) {
		const replyLine = AutoModerationOnInfraction.has(value, AutoModerationOnInfraction.flags.Alert)
			? translateKey(t, `${Root}:showReplyActive`, { emoji: Emojis.Reply })
			: translateKey(t, `${Root}:showReplyInactive`, { emoji: Emojis.ReplyInactive });
		const logLine = AutoModerationOnInfraction.has(value, AutoModerationOnInfraction.flags.Log)
			? translateKey(t, `${Root}:showLogActive`, { emoji: Emojis.Flag })
			: translateKey(t, `${Root}:showLogInactive`, { emoji: Emojis.FlagInactive });
		const deleteLine = AutoModerationOnInfraction.has(value, AutoModerationOnInfraction.flags.Delete)
			? translateKey(t, `${Root}:showDeleteActive`, { emoji: Emojis.Delete })
			: translateKey(t, `${Root}:showDeleteInactive`, { emoji: Emojis.DeleteInactive });

		return `${replyLine}\n${logLine}\n${deleteLine}`;
	}

	protected showEnabledOnPunishment(
		t: TFunction,
		punishment: AutoModerationHardAction & string,
		punishmentDuration: bigint | number | null,
		adder: Adder<string> | null
	): string {
		const { key, emoji } = this.showEnabledOnPunishmentNameKey(punishment);
		const name = translateKey(t, key);
		let line: string;
		if (isNullishOrZero(punishmentDuration)) {
			line = translateKey(t, `${Root}:showPunishment`, { name, emoji });
			// Add strikethrough if the punishment is a timeout and the duration is not set:
			if (punishment === 'Timeout') line = strikethrough(line);
		} else {
			line = translateKey(t, `${Root}:showPunishmentTemporary`, {
				name,
				emoji,
				duration: translateKey(t, 'globals:durationValue', { value: Number(punishmentDuration) })
			});
		}

		return isNullish(adder) ? line : `${line}\n${this.showEnabledOnPunishmentThreshold(t, adder)}`;
	}

	protected showEnabledOnPunishmentNameKey(punishment: AutoModerationHardAction & string): { key: TranslationKey; emoji: string } {
		switch (punishment) {
			case 'Ban':
				return { key: 'moderation:typeBan', emoji: Emojis.Ban };
			case 'Kick':
				return { key: 'moderation:typeKick', emoji: Emojis.Kick };
			case 'Timeout':
				return { key: 'moderation:typeTimeout', emoji: Emojis.Timeout };
			case 'VoiceKick':
				return { key: 'moderation:typeVoiceKick', emoji: Emojis.Kick };
			case 'Softban':
				return { key: 'moderation:typeSoftban', emoji: Emojis.Softban };
			case 'Warning':
				return { key: 'moderation:typeWarning', emoji: Emojis.Flag };
		}
	}

	protected showEnabledOnPunishmentThreshold(t: TFunction, adder: Adder<string>): string {
		return translateKey(t, `${Root}:showPunishmentThreshold`, {
			threshold: adder.maximum,
			period: translateKey(t, 'globals:durationValue', { value: adder.duration }),
			emoji: Emojis.Bucket
		});
	}

	/**
	 * Applies the name, the description, the scope and the default permissions of the command.
	 *
	 * @param builder - The builder to apply the data to.
	 * @param options - The options of the command.
	 */
	protected registerCommand(builder: SlashCommandBuilder, options: AutoModerationCommand.Options) {
		return applyLocalizedBuilder(builder, options.localizedNameKey)
			.setContexts(InteractionContextType.Guild)
			.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
	}

	protected registerShowSubcommand(subcommand: SlashCommandSubcommandBuilder) {
		return applyLocalizedBuilder(subcommand, `${Root}:show`);
	}

	protected registerEditSubcommand(subcommand: SlashCommandSubcommandBuilder, options: AutoModerationCommand.Options) {
		const configurableKeys = getConfigurableKeys();
		const threshold = configurableKeys.get(options.keyPunishmentThresholdPeriod)!;

		return applyLocalizedBuilder(subcommand, `${Root}:edit`) //
			.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsEnabled`))
			.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsActionAlert`))
			.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsActionLog`))
			.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsActionDelete`))
			.addStringOption((option) =>
				applyLocalizedBuilder(option, `${Root}:optionsPunishment`) //
					.setChoices(
						createLocalizedChoice('moderation:typeWarning', { value: 'Warning' }),
						createLocalizedChoice('moderation:typeTimeout', { value: 'Timeout' }),
						createLocalizedChoice('moderation:typeKick', { value: 'Kick' }),
						createLocalizedChoice('moderation:typeSoftban', { value: 'Softban' }),
						createLocalizedChoice('moderation:typeBan', { value: 'Ban' }),
						createLocalizedChoice('moderation:typeVoiceKick', { value: 'VoiceKick' })
					)
			)
			.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsPunishmentDuration`))
			.addIntegerOption((option) =>
				applyLocalizedBuilder(option, `${Root}:optionsThreshold`).setMinValue(threshold.minimum!).setMaxValue(threshold.maximum!)
			)
			.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsThresholdPeriod`));
	}

	protected registerResetSubcommand(subcommand: SlashCommandSubcommandBuilder, options: AutoModerationCommand.Options) {
		const choices = [
			createLocalizedChoice(`${Root}:optionsKeyEnabled`, { value: 'enabled' }),
			createLocalizedChoice(`${Root}:optionsKeyActionAlert`, { value: 'alert' }),
			createLocalizedChoice(`${Root}:optionsKeyActionLog`, { value: 'log' }),
			createLocalizedChoice(`${Root}:optionsKeyActionDelete`, { value: 'delete' }),
			createLocalizedChoice(`${Root}:optionsKeyPunishment`, { value: 'punishment' }),
			createLocalizedChoice(`${Root}:optionsKeyPunishmentDuration`, { value: 'punishment-duration' }),
			createLocalizedChoice(`${Root}:optionsKeyThreshold`, { value: 'threshold' }),
			createLocalizedChoice(`${Root}:optionsKeyThresholdPeriod`, { value: 'threshold-duration' })
		];

		for (const { key: name, value } of options.resetKeys ?? []) {
			choices.push(createLocalizedChoice(name, { value }));
		}

		return applyLocalizedBuilder(subcommand, `${Root}:reset`).addStringOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsKey`)
				.setChoices(...choices)
				.setRequired(true)
		);
	}

	#getInfraction(options: AutoModerationCommand.EditArguments, existing: number) {
		const existingActionAlert = AutoModerationOnInfraction.has(existing, AutoModerationOnInfraction.flags.Alert);
		const existingActionLog = AutoModerationOnInfraction.has(existing, AutoModerationOnInfraction.flags.Log);
		const existingActionDelete = AutoModerationOnInfraction.has(existing, AutoModerationOnInfraction.flags.Delete);

		let bitfield = 0;
		if (options.alert ?? existingActionAlert) bitfield |= AutoModerationOnInfraction.flags.Alert;
		if (options.log ?? existingActionLog) bitfield |= AutoModerationOnInfraction.flags.Log;
		if (options.delete ?? existingActionDelete) bitfield |= AutoModerationOnInfraction.flags.Delete;

		return bitfield;
	}

	/**
	 * Resolves a duration option.
	 *
	 * @returns `null` when the option was not given, the duration, or an object with the translated error.
	 */
	#getDuration(t: TFunction, parameter: string | undefined, minimum: number, maximum: number): number | null | { error: string } {
		if (isNullishOrEmpty(parameter)) return null;

		const result = resolveTimeSpan(parameter, { minimum, maximum });
		if (result.isOk()) return result.unwrap();
		return { error: translateKey(t, result.unwrapErr() as TranslationKey, { parameter, minimum, maximum }) };
	}
}

type ResetKey = 'enabled' | 'alert' | 'log' | 'delete' | 'punishment' | 'punishment-duration' | 'threshold' | 'threshold-duration';

export namespace AutoModerationCommand {
	export type LoaderContext = Command.LoaderContext;
	export type Interaction = GuildChatInputInteraction;

	/**
	 * The AutoModerationCommand Options
	 */
	export interface Options extends Command.Options {
		/**
		 * The root key of the name and the description of the command, e.g. `commands/auto-moderation:attachments`.
		 */
		localizedNameKey: `${string}:${string}`;
		adderPropertyName: AdderKey;
		keyEnabled: GuildSettingsOfType<boolean>;
		keyOnInfraction: GuildSettingsOfType<number>;
		keyPunishment: GuildSettingsOfType<AutoModerationHardAction>;
		keyPunishmentDuration: GuildSettingsOfType<bigint | number | null>;
		keyPunishmentThreshold: GuildSettingsOfType<number | null>;
		keyPunishmentThresholdPeriod: GuildSettingsOfType<number | null>;
		resetKeys?: readonly OptionsResetKey[];
	}

	export interface OptionsResetKey {
		key: TranslationKey;
		value: string;
	}

	/**
	 * The options of the `edit` subcommand.
	 */
	export interface EditArguments {
		enabled?: boolean;
		alert?: boolean;
		log?: boolean;
		delete?: boolean;
		punishment?: number;
		'punishment-duration'?: string;
		threshold?: number;
		'threshold-period'?: string;
	}

	/**
	 * The options of the `reset` subcommand.
	 */
	export interface ResetArguments {
		key: string;
	}
}
