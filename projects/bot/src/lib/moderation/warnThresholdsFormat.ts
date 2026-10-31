import type { TranslationKey, Translator } from '#lib/structures/commands/utils';
import type { WarnThreshold, WarnThresholdAction } from 'wolfstar-database';

/**
 * The names of the actions of a threshold of warnings.
 */
export const WarnThresholdActionKeys = {
	Timeout: 'commands/warn-thresholds:actionTimeout',
	Mute: 'commands/warn-thresholds:actionMute',
	Kick: 'commands/warn-thresholds:actionKick',
	Softban: 'commands/warn-thresholds:actionSoftban',
	Ban: 'commands/warn-thresholds:actionBan',
	VoiceKick: 'commands/warn-thresholds:actionVoiceKick'
} as const satisfies Record<WarnThresholdAction, TranslationKey>;

/**
 * Describes a threshold in a line: `3 warnings within 30 days → Mute for 1 day`.
 *
 * @param t - The function to translate with.
 * @param threshold - The threshold.
 */
export function formatWarnThreshold(t: Translator, threshold: WarnThreshold): string {
	const action = t(WarnThresholdActionKeys[threshold.action]);
	const warnings =
		threshold.period > 0
			? t('commands/warn-thresholds:lineWithin', { count: threshold.count, period: threshold.period })
			: t('commands/warn-thresholds:line', { count: threshold.count });
	const punishment = threshold.duration === null ? action : t('commands/warn-thresholds:lineDuration', { action, duration: threshold.duration });
	return `${warnings} → ${punishment}`;
}
