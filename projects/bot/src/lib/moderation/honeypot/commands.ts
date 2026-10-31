import { getSettingName } from '#lib/database';
import { createTranslator, translateKey, type TranslationKey } from '#lib/structures/commands/utils';
import { Colors } from '#utils/constants';
import { EmbedBuilder } from '@discordjs/builders';
import { channelMention, inlineCode } from '@discordjs/formatters';
import type { TFunction } from '@wolfstar/plugin-i18next';
import type { HoneypotAction, ReadonlyGuildData } from 'wolfstar-database';

export const HoneypotRoot = 'commands/honeypot';
const Root = HoneypotRoot;

/**
 * The name of each action, as the `action` choices and the messages show it.
 */
export const HoneypotActionKeys = {
	Kick: 'serializers:honeypotActionKick',
	Softban: 'serializers:honeypotActionSoftban',
	Ban: 'serializers:honeypotActionBan'
} as const satisfies Record<HoneypotAction, TranslationKey>;

/**
 * The settings of the honeypot, in the order the summary lists them.
 */
const SummaryKeys = [
	'honeypotChannel',
	'honeypotAction',
	'honeypotLogChannel',
	'honeypotDirectMessage',
	'honeypotWarning',
	'honeypotRandomName',
	'honeypotKeepActive'
] as const satisfies readonly (keyof ReadonlyGuildData)[];

/**
 * Builds the summary of the honeypot of a guild, which every `/honeypot` subcommand answers with: its channel and each
 * of its settings, named as the settings menu names them, or how to set it up when it is off.
 *
 * @param t - The function to translate with, in the language of the user.
 * @param settings - The settings of the guild.
 */
export function renderHoneypotSummary(t: TFunction, settings: ReadonlyGuildData) {
	const embed = new EmbedBuilder().setTitle(translateKey(t, `${Root}:showTitle`));
	if (settings.honeypotChannel === null) {
		return embed.setColor(Colors.Grey).setDescription(translateKey(t, `${Root}:showOff`, { command: inlineCode('/honeypot setup') }));
	}

	const translator = createTranslator(t);
	const lines = SummaryKeys.map((key) =>
		translateKey(t, `${Root}:showLine`, { name: getSettingName(translator, key), value: displayValue(t, settings[key]) })
	);
	return embed.setColor(Colors.Amber).setDescription(lines.join('\n'));
}

function displayValue(t: TFunction, value: string | boolean | null): string {
	if (value === null) return translateKey(t, `${Root}:showNone`);
	if (typeof value === 'boolean') return translateKey(t, value ? 'arguments:booleanEnabled' : 'arguments:booleanDisabled');
	if (value in HoneypotActionKeys) return translateKey(t, HoneypotActionKeys[value as HoneypotAction]);
	return channelMention(value);
}
