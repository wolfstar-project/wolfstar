import {
	AutoModerationRoot,
	AutoModerationRuleTypeKeys,
	applyRuleOption,
	resolveCommandRule,
	resolveDurationOption,
	resolveSoftAction,
	translateRuleError
} from '#lib/moderation/automod/commands';
import { updateAutoModerationRule } from '#lib/moderation/automod/rules';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { isNullish } from '@sapphire/utilities';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT, type TFunction } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import {
	AutoModerationRuleLimits,
	AutoModerationRuleOptionLimits,
	MaximumAutoModerationRuleNameLength,
	type AutoModerationHardAction,
	type AutoModerationRule,
	type AutoModerationRuleData
} from 'wolfstar-database';

const Root = AutoModerationRoot;

interface Options {
	rule: string;
	rename?: string;
	enabled?: boolean;
	alert?: boolean;
	log?: boolean;
	delete?: boolean;
	punishment?: AutoModerationHardAction;
	'punishment-duration'?: string;
	threshold?: number;
	'threshold-period'?: string;
	minimum?: number;
	maximum?: number;
	mentions?: number;
	period?: number;
	warn?: boolean;
}

/**
 * The options of `/automod edit` that only some types of rule have, with the name of the option of the rule they set.
 */
const TypeOptions = [
	['minimum', 'minimum'],
	['maximum', 'maximum'],
	['mentions', 'mentionsAllowed'],
	['period', 'timePeriod'],
	['warn', 'alerts']
] as const satisfies readonly (readonly [keyof Options, string])[];

/**
 * `/automod edit`, see the `automod` parent command.
 *
 * @remarks The `minimum`, `maximum`, `mentions`, `period` and `warn` options set the options of the rule, which depend
 * on its type: a rule answers with an error when it is given one it does not have.
 */
@RegisterAsSubcommand('automod', (builder) =>
	applyRuleOption(applyLocalizedBuilder(builder, `${Root}:edit`))
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsNewName`).setMaxLength(MaximumAutoModerationRuleNameLength))
		.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsEnabled`))
		.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsActionAlert`))
		.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsActionLog`))
		.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsActionDelete`))
		.addStringOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsPunishment`).setChoices(
				createLocalizedChoice('moderation:typeWarning', { value: 'Warning' }),
				createLocalizedChoice('moderation:typeTimeout', { value: 'Timeout' }),
				createLocalizedChoice('moderation:typeMute', { value: 'Mute' }),
				createLocalizedChoice('moderation:typeKick', { value: 'Kick' }),
				createLocalizedChoice('moderation:typeSoftban', { value: 'Softban' }),
				createLocalizedChoice('moderation:typeBan', { value: 'Ban' }),
				createLocalizedChoice('moderation:typeVoiceKick', { value: 'VoiceKick' })
			)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsPunishmentDuration`))
		.addIntegerOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsThreshold`)
				.setMinValue(AutoModerationRuleLimits.thresholdMaximum.minimum)
				.setMaxValue(AutoModerationRuleLimits.thresholdMaximum.maximum)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsThresholdPeriod`))
		.addIntegerOption((option) => applyLocalizedBuilder(option, `${Root}:optionsMinimum`))
		.addIntegerOption((option) => applyLocalizedBuilder(option, `${Root}:optionsMaximum`))
		.addIntegerOption((option) => applyLocalizedBuilder(option, `${Root}:optionsMentions`))
		.addIntegerOption((option) => applyLocalizedBuilder(option, `${Root}:optionsPeriod`))
		.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsWarn`))
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Options) {
		const t = getSupportedUserLanguageT(interaction);
		const rule = await resolveCommandRule(interaction, t, options.rule);
		if (rule === null) return;

		const punishmentDuration = resolveDurationOption(t, options['punishment-duration'], AutoModerationRuleLimits.hardActionDuration);
		if (typeof punishmentDuration === 'object' && punishmentDuration !== null) return this.#reply(interaction, punishmentDuration.error);
		const thresholdDuration = resolveDurationOption(t, options['threshold-period'], AutoModerationRuleLimits.thresholdDuration);
		if (typeof thresholdDuration === 'object' && thresholdDuration !== null) return this.#reply(interaction, thresholdDuration.error);

		const ruleOptions = this.#getRuleOptions(t, rule, options);
		if (typeof ruleOptions === 'string') return this.#reply(interaction, ruleOptions);

		const data: Partial<Omit<AutoModerationRuleData, 'type'>> = {};
		if (!isNullish(options.rename)) data.name = options.rename;
		if (!isNullish(options.enabled)) data.enabled = options.enabled;
		if (!isNullish(options.alert ?? options.log ?? options.delete)) data.softAction = resolveSoftAction(options, rule.softAction);
		if (!isNullish(options.punishment)) data.hardAction = options.punishment;
		// A duration of zero makes the punishment permanent:
		if (punishmentDuration !== null) data.hardActionDuration = punishmentDuration === 0 ? null : punishmentDuration;
		if (!isNullish(options.threshold)) data.thresholdMaximum = options.threshold;
		if (thresholdDuration !== null) data.thresholdDuration = thresholdDuration;
		if (ruleOptions !== null) data.options = ruleOptions;

		if (Object.keys(data).length === 0) return this.#reply(interaction, translateKey(t, `${Root}:editNothing`));

		let content: string;
		try {
			const updated = await updateAutoModerationRule(interaction.guildId, rule.id, data);
			content = translateKey(t, `${Root}:editSuccess`, { name: updated.name });
		} catch (error) {
			content = translateRuleError(t, error, options.rule);
		}

		return this.#reply(interaction, content);
	}

	/**
	 * The options of the rule after the options of the command that set them.
	 *
	 * @returns `null` when none was given, or the translated error when one does not fit the rule.
	 */
	#getRuleOptions(t: TFunction, rule: AutoModerationRule, options: Options): AutoModerationRule['options'] | string | null {
		const current = rule.options as Record<string, unknown>;
		const limits = (AutoModerationRuleOptionLimits as Record<string, Record<string, { minimum: number; maximum: number }> | undefined>)[
			rule.type
		];

		let patch: Record<string, unknown> | null = null;
		for (const [option, key] of TypeOptions) {
			const value = options[option];
			if (isNullish(value)) continue;

			if (!(key in current)) {
				return translateKey(t, `${Root}:errorOptionNotSupported`, {
					name: rule.name,
					type: translateKey(t, AutoModerationRuleTypeKeys[rule.type]),
					option
				});
			}

			const limit = limits?.[key];
			if (typeof value === 'number' && limit && (value < limit.minimum || value > limit.maximum)) {
				return translateKey(t, `${Root}:errorOptionRange`, { option, ...limit });
			}

			patch ??= {};
			patch[key] = value;
		}

		return patch === null ? null : ({ ...current, ...patch } as AutoModerationRule['options']);
	}

	#reply(interaction: GuildChatInputInteraction, content: string) {
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}
