import { addWarnThreshold, WarnThresholdLimitError } from '#lib/moderation/warnThresholds';
import { createTranslator, type GuildChatInputInteraction, type Translator } from '#lib/structures/commands/utils';
import { resolveTimeSpan } from '#utils/resolvers';
import { days } from 'wolfstar-shared';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { WarnThresholdActions, type WarnThresholdAction } from 'wolfstar-database';
import { formatWarnThreshold, WarnThresholdActionKeys } from '#lib/moderation/warnThresholdsFormat';

const Root = 'commands/warn-thresholds';

/**
 * The longest period the warnings are counted in, and the longest action.
 */
const MaximumDuration = days(365);

/**
 * `/warn-thresholds add`, see the `warn-thresholds` parent command. Sets what happens to a member who reaches a number
 * of warnings, which replaces what the server had for that number.
 */
@RegisterAsSubcommand('warn-thresholds', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:add`)
		.addIntegerOption((option) => applyLocalizedBuilder(option, `${Root}:optionsCount`).setRequired(true).setMinValue(1).setMaxValue(50))
		.addStringOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsAction`)
				.setRequired(true)
				.setChoices(...WarnThresholdActions.map((action) => createLocalizedChoice(WarnThresholdActionKeys[action], { value: action })))
		)
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsDuration`).setMaxLength(32))
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsPeriod`).setMaxLength(32))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'warn-thresholds add'>) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
		const action = options.action as WarnThresholdAction;

		const duration = this.parseDuration(t, options.duration);
		if (typeof duration === 'string') return reply(duration);
		// Discord takes no timeout without an end:
		if (action === 'Timeout' && duration === null) return reply(t(`${Root}:timeoutNeedsDuration`));

		const period = this.parseDuration(t, options.period);
		if (typeof period === 'string') return reply(period);

		const threshold = { count: options.count, action, duration, period: period ?? 0 };
		try {
			const created = await addWarnThreshold(interaction.guildId, threshold);
			const line = formatWarnThreshold(t, threshold);
			return reply(t(created ? `${Root}:added` : `${Root}:replaced`, { threshold: line }));
		} catch (error) {
			if (error instanceof WarnThresholdLimitError) return reply(t(`${Root}:limit`, { maximum: error.maximum }));
			throw error;
		}
	}

	/**
	 * Reads a duration that was written, `null` when it was left out, the translated error when it is not one.
	 */
	private parseDuration(t: Translator, input: string | undefined): number | null | string {
		if (input === undefined || input.trim() === '') return null;

		const result = resolveTimeSpan(input, { minimum: 1000, maximum: MaximumDuration });
		if (result.isErr()) return t(result.unwrapErr(), { parameter: input, minimum: 1000, maximum: MaximumDuration });
		return result.unwrap();
	}
}
