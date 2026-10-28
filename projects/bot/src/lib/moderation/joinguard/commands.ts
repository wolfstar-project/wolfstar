import { getSettingName } from '#lib/database';
import { createTranslator, translateKey } from '#lib/structures/commands/utils';
import { Colors, Urls } from '#utils/constants';
import { EmbedBuilder } from '@discordjs/builders';
import { channelMention, inlineCode, roleMention } from '@discordjs/formatters';
import type { TFunction } from '@wolfstar/plugin-i18next';
import type { JoinGuardCheckpointCounts, JoinGuardRule, JoinGuardSettings } from 'wolfstar-database';
import { hasJoinGuardConditions } from '#lib/moderation/joinguard/conditions';

export const JoinGuardRoot = 'commands/join-guard';
const Root = JoinGuardRoot;

/**
 * The page of the dashboard of a guild, where its join guard is set up.
 */
export function getJoinGuardDashboardUrl(guildId: string) {
	return `${Urls.Website}/guilds/${guildId}/manage`;
}

/**
 * The settings of the checkpoint, in the order the summary lists them.
 */
const CheckpointKeys = [
	'joinGuardCheckpoint',
	'joinGuardPendingRole',
	'joinGuardVerifiedRole',
	'joinGuardCheckpointChannel',
	'joinGuardCheckpointTimeout',
	'joinGuardMinimumTrust',
	'joinGuardCaptcha',
	'joinGuardConnections',
	'joinGuardSharedBans'
] as const satisfies readonly (keyof JoinGuardSettings)[];

/**
 * Builds the summary of the join guard of a guild that `/joinguard show` answers with: whether it is on, what it did
 * this week, its rules, and the settings of its checkpoint.
 *
 * @param t - The function to translate with, in the language of the user.
 * @param guildId - The guild.
 * @param settings - The settings of the guard.
 * @param rules - Its rules.
 * @param counts - What it did this week.
 */
export function renderJoinGuardSummary(
	t: TFunction,
	guildId: string,
	settings: JoinGuardSettings,
	rules: readonly JoinGuardRule[],
	counts: JoinGuardCheckpointCounts
) {
	const translator = createTranslator(t);
	const status = translateKey(t, settings.joinGuardEnabled ? `${Root}:showOn` : `${Root}:showOff`);
	const description = [
		translateKey(t, `${Root}:showStatus`, { status }),
		`**${getSettingName(translator, 'joinGuardLogChannel')}**: ${settings.joinGuardLogChannel === null ? translateKey(t, `${Root}:showNone`) : channelMention(settings.joinGuardLogChannel)}`,
		translateKey(t, `${Root}:showWeek`, { stopped: counts.stopped, waiting: counts.waiting })
	];

	const ruleLines =
		rules.length === 0
			? [translateKey(t, `${Root}:showRulesNone`, { url: getJoinGuardDashboardUrl(guildId) })]
			: rules.map((rule) => formatJoinGuardRule(t, rule));
	const checkpointLines = CheckpointKeys.map((key) =>
		translateKey(t, `${Root}:showLine`, { name: getSettingName(translator, key), value: displayValue(t, key, settings[key]) })
	);

	return new EmbedBuilder()
		.setTitle(translateKey(t, `${Root}:showTitle`))
		.setColor(settings.joinGuardEnabled ? Colors.Green : Colors.Grey)
		.setDescription(description.join('\n'))
		.addFields(
			{ name: translateKey(t, `${Root}:showRulesTitle`), value: ruleLines.join('\n').slice(0, 1024) },
			{ name: translateKey(t, `${Root}:showCheckpointTitle`), value: checkpointLines.join('\n').slice(0, 1024) }
		);
}

/**
 * Describes a rule in one line: its conditions, then its actions.
 */
function formatJoinGuardRule(t: TFunction, rule: JoinGuardRule): string {
	const conditions: string[] = [];
	if (rule.accountAgeMax !== null) {
		conditions.push(translateKey(t, `${Root}:conditionAccountAge`, { duration: formatSeconds(rule.accountAgeMax) }));
	}
	if (rule.defaultAvatar) conditions.push(translateKey(t, `${Root}:conditionDefaultAvatar`));
	if (rule.generatedName) conditions.push(translateKey(t, `${Root}:conditionGeneratedName`));
	if (rule.nameContains !== null) conditions.push(translateKey(t, `${Root}:conditionNameContains`, { text: inlineCode(rule.nameContains) }));
	if (rule.unverifiedBot) conditions.push(translateKey(t, `${Root}:conditionUnverifiedBot`));

	const actions: string[] = [];
	if (rule.sendToCheckpoint) actions.push(translateKey(t, `${Root}:actionCheckpoint`));
	if (rule.roleId !== null) actions.push(translateKey(t, `${Root}:actionRole`, { role: roleMention(rule.roleId) }));
	if (rule.directMessage) actions.push(translateKey(t, `${Root}:actionDirectMessage`));
	if (rule.alertChannelId !== null) actions.push(translateKey(t, `${Root}:actionAlert`, { channel: channelMention(rule.alertChannelId) }));
	if (rule.hardAction === 'Kick') actions.push(translateKey(t, `${Root}:actionKick`));
	if (rule.hardAction === 'Ban') actions.push(translateKey(t, `${Root}:actionBan`));

	return translateKey(t, `${Root}:showRule`, {
		status: rule.enabled ? '•' : translateKey(t, `${Root}:showRuleDisabled`),
		name: rule.name,
		conditions: hasJoinGuardConditions(rule) ? conditions.join(', ') : translateKey(t, `${Root}:conditionNone`),
		actions: actions.length === 0 ? translateKey(t, `${Root}:actionNone`) : actions.join(', ')
	});
}

/**
 * Writes a number of seconds in the largest unit it is a whole number of: `86400` is `1d`.
 */
function formatSeconds(seconds: number): string {
	const units = [
		['d', 86_400],
		['h', 3600],
		['m', 60]
	] as const;
	for (const [unit, size] of units) {
		if (seconds >= size && seconds % size === 0) return `${seconds / size}${unit}`;
	}
	return `${seconds}s`;
}

function displayValue(t: TFunction, key: (typeof CheckpointKeys)[number], value: string | number | boolean | null): string {
	if (value === null) return translateKey(t, `${Root}:showNone`);
	if (typeof value === 'boolean') return translateKey(t, value ? 'arguments:booleanEnabled' : 'arguments:booleanDisabled');
	if (key === 'joinGuardCheckpointTimeout')
		return value === 0 ? translateKey(t, 'serializers:joinGuardTimeoutNever') : formatSeconds(Number(value));
	if (key === 'joinGuardMinimumTrust') return String(value);
	return key === 'joinGuardCheckpointChannel' ? channelMention(String(value)) : roleMention(String(value));
}
