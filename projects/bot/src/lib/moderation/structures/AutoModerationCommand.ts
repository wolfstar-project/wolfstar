import { getConfigurableKeys, type AdderKey } from '#lib/database';
import { type AutoModerationHardAction, type GuildSettingsOfType } from 'wolfstar-database';
import type { GuildChatInputInteraction, TranslationKey } from '#lib/structures/commands/utils';
import type { SlashCommandBuilder, SlashCommandSubcommandBuilder } from '@discordjs/builders';
import { ApplyOptions } from '@wolfstar/decorators';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The base class of the subcommands of the auto-moderation rule commands (`automod-attachments`, `automod-capitals`,
 * `automod-links`, ...), each of which is a {@linkcode Subcommand} parent with the `show`, `edit` and `reset`
 * subcommands, wired onto it by `@wolfstar/plugin-subcommands-advanced`.
 *
 * The rule a subcommand configures is read from its piece options, which are the
 * {@linkcode AutoModerationCommand.Options | rule} of `AutoModerationRules`. A subcommand file is therefore only its
 * decorator and an empty class, see {@linkcode AutoModerationShowCommand}, {@linkcode AutoModerationEditCommand} and
 * {@linkcode AutoModerationResetCommand}.
 *
 * @remarks
 *
 * The permission level is {@linkcode CommandPermissionLevel.Administrator}, plus `ManageGuild` as the default member
 * permission of the parent command, see {@linkcode createAutoModerationCommandBuilder}.
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
	}
}

/**
 * Creates the builder of the parent command of a rule, to give to `@RegisterCommand`:
 *
 * @example
 * ```typescript
 * \@RegisterCommand(createAutoModerationCommandBuilder(AutoModerationRules.links))
 * export class UserCommand extends Subcommand {}
 * ```
 *
 * @param rule - The rule the command manages.
 */
export function createAutoModerationCommandBuilder(rule: AutoModerationCommand.Options) {
	return (builder: SlashCommandBuilder) =>
		applyLocalizedBuilder(builder, rule.localizedNameKey)
			.setContexts(InteractionContextType.Guild)
			.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
}

/**
 * Creates the decorator of a subcommand of a rule: it applies the rule as the options of the piece, and registers
 * the class as a subcommand of the parent command of the rule.
 *
 * @remarks
 *
 * The options are applied above the registration, as `ApplyOptions` returns a proxy and the registration is keyed by
 * the class identity.
 *
 * @param rule - The rule the subcommand configures.
 * @param builder - The builder of the subcommand.
 */
export function registerAutoModerationSubcommand(
	rule: AutoModerationCommand.Rule,
	builder: (builder: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder
) {
	return <T extends AutoModerationCommand.Constructor>(target: T): T => {
		const registered = RegisterAsSubcommand(rule.commandName, builder)(target);
		return (ApplyOptions<AutoModerationCommand.Options>(rule)(registered) ?? registered) as T;
	};
}

/**
 * Gets the minimum and the maximum of a configurable key, which are always set for the durations and the thresholds.
 *
 * @param key - The key to read the limits of.
 */
export function getAutoModerationLimits(key: GuildSettingsOfType<bigint | number | null>) {
	const { minimum, maximum } = getConfigurableKeys().get(key)!;
	return { minimum: minimum!, maximum: maximum! };
}

export declare namespace AutoModerationCommand {
	type LoaderContext = Command.LoaderContext;
	type Interaction = GuildChatInputInteraction;
	type Constructor = new (...args: any[]) => Command;

	/**
	 * The options of an auto-moderation subcommand, the configuration of a rule.
	 */
	interface Options extends Command.Options {
		/**
		 * The root key of the name and the description of the parent command, e.g. `commands/auto-moderation:attachments`.
		 */
		localizedNameKey: `${string}:${string}`;
		adderPropertyName: AdderKey;
		keyEnabled: GuildSettingsOfType<boolean>;
		keyOnInfraction: GuildSettingsOfType<number>;
		keyPunishment: GuildSettingsOfType<AutoModerationHardAction>;
		keyPunishmentDuration: GuildSettingsOfType<bigint | number | null>;
		keyPunishmentThreshold: GuildSettingsOfType<number | null>;
		keyPunishmentThresholdPeriod: GuildSettingsOfType<number | null>;
		/**
		 * The extra keys of the `key` choices of the `reset` subcommand.
		 */
		resetKeys?: readonly OptionsResetKey[];
	}

	/**
	 * The configuration of a rule, with the name of its parent command.
	 */
	interface Rule extends Options {
		/**
		 * The name of the parent command, e.g. `automod-attachments`.
		 */
		commandName: string;
	}

	interface OptionsResetKey {
		key: TranslationKey;
		value: string;
	}

	/**
	 * The options of the `edit` subcommand.
	 */
	interface EditArguments {
		enabled?: boolean;
		alert?: boolean;
		log?: boolean;
		delete?: boolean;
		punishment?: AutoModerationHardAction;
		'punishment-duration'?: string;
		threshold?: number;
		'threshold-period'?: string;
	}

	/**
	 * The options of the `reset` subcommand.
	 */
	interface ResetArguments {
		key: string;
	}
}
