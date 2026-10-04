import { writeSettingsTransaction, type SchemaDataKey } from '#lib/database';
import { type GuildData, type GuildDataValue } from 'wolfstar-database';
import { AutoModerationCommand, getAutoModerationLimits, registerAutoModerationSubcommand } from '#lib/moderation/structures/AutoModerationCommand';
import { AutoModerationOnInfraction } from '#lib/moderation/structures/AutoModerationOnInfraction';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type TranslationKey } from '#lib/structures/commands/utils';
import { resolveTimeSpan } from '#utils/resolvers';
import { isNullish, isNullishOrEmpty } from '@sapphire/utilities';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT, type TFunction } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';

const Root = 'commands/auto-moderation';

/**
 * The `edit` subcommand of an auto-moderation rule command.
 *
 * @example
 * ```typescript
 * const rule = AutoModerationRules.links;
 *
 * \@AutoModerationEditCommand.register(rule)
 * export class UserCommand extends AutoModerationEditCommand {}
 * ```
 */
export abstract class AutoModerationEditCommand extends AutoModerationCommand {
	/**
	 * Registers the decorated class as the `edit` subcommand of a rule, and gives it the rule as options.
	 *
	 * @param rule - The rule the subcommand edits.
	 */
	public static register(rule: AutoModerationCommand.Rule) {
		const threshold = () => getAutoModerationLimits(rule.keyPunishmentThresholdPeriod);
		return registerAutoModerationSubcommand(rule, (builder) =>
			applyLocalizedBuilder(builder, `${Root}:edit`) //
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
					applyLocalizedBuilder(option, `${Root}:optionsThreshold`).setMinValue(threshold().minimum).setMaxValue(threshold().maximum)
				)
				.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsThresholdPeriod`))
		);
	}

	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: AutoModerationCommand.Interaction, options: AutoModerationCommand.EditArguments) {
		const t = getSupportedUserLanguageT(interaction);
		const valuePunishmentDuration = this.#getDuration(t, options['punishment-duration'], getAutoModerationLimits(this.keyPunishmentDuration));
		const valuePunishmentThresholdDuration = this.#getDuration(
			t,
			options['threshold-period'],
			getAutoModerationLimits(this.keyPunishmentThresholdPeriod)
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
	#getDuration(
		t: TFunction,
		parameter: string | undefined,
		{ minimum, maximum }: { minimum: number; maximum: number }
	): number | null | { error: string } {
		if (isNullishOrEmpty(parameter)) return null;

		const result = resolveTimeSpan(parameter, { minimum, maximum });
		if (result.isOk()) return result.unwrap();
		return { error: translateKey(t, result.unwrapErr() as TranslationKey, { parameter, minimum, maximum }) };
	}
}
