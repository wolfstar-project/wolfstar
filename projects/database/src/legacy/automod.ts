import {
	AutoModerationRuleLimits,
	getDefaultAutoModerationRuleOptions,
	normalizeAutoModerationRuleOptions,
	type AutoModerationRuleType
} from '../settings/automod/types.js';
import { readSnowflakes, readTexts, type InsertRow, type LegacyRow } from './types.js';

/** The legacy hard actions, by the integer the `selfmod.*.hard-action` columns hold. */
const HardActions = ['None', 'Warning', 'Kick', 'Mute', 'Softban', 'Ban', 'Timeout'];

const DefaultThreshold = { maximum: 10, duration: 60_000 };

/** The `AutoModerationOnInfraction` bit that alerts the member. */
const AlertBit = 1 << 2;

interface LegacyRuleSource {
	/** The name of its group of columns, `selfmod.<key>.*`. */
	key: string;
	name: string;
	type: AutoModerationRuleType;
	options: (row: LegacyRow, key: string) => Record<string, unknown>;
}

const LegacyRules: LegacyRuleSource[] = [
	{ key: 'attachments', name: 'Attachments', type: 'Attachments', options: () => ({}) },
	{
		key: 'capitals',
		name: 'Capitals',
		type: 'Capitals',
		options: (row, key) => ({ minimum: row[`selfmod.${key}.minimum`], maximum: row[`selfmod.${key}.maximum`] })
	},
	{ key: 'links', name: 'Links', type: 'Links', options: (row, key) => ({ allowed: readTexts(row, `selfmod.${key}.allowed`) }) },
	{
		key: 'invites',
		name: 'Invites',
		type: 'Invites',
		options: (row, key) => ({
			allowedCodes: readTexts(row, `selfmod.${key}.ignored-codes`),
			allowedGuilds: readSnowflakes(row, `selfmod.${key}.ignored-guilds`)
		})
	},
	{ key: 'newlines', name: 'New lines', type: 'Newlines', options: (row, key) => ({ maximum: row[`selfmod.${key}.maximum`] }) },
	{ key: 'filter', name: 'Words', type: 'Words', options: (row, key) => ({ words: readTexts(row, `selfmod.${key}.raw`) }) },
	{
		key: 'messages',
		name: 'Identical messages',
		type: 'MessageDuplicates',
		options: (row, key) => ({ maximum: row[`selfmod.${key}.maximum`], queueSize: row[`selfmod.${key}.queue-size`] })
	}
];

function clamp(value: number, { minimum, maximum }: { minimum: number; maximum: number }) {
	return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Tells the numbers of the options the limits of V7 changed, which are a stricter or a looser rule than the guild had.
 */
function warnChangedOptions(name: string, given: Record<string, unknown>, options: object, warnings: string[]) {
	for (const [key, value] of Object.entries(options)) {
		if (typeof value !== 'number' || given[key] === value) continue;
		warnings.push(`The option "${key}" of the rule "${name}" was changed from ${String(given[key])} to ${value}.`);
	}
}

function convertRule(row: LegacyRow, guildId: string, ignoredEverywhere: readonly string[], source: LegacyRuleSource, warnings: string[]) {
	const { key, name, type } = source;
	const prefix = `selfmod.${key}`;

	const enabled = row[`${prefix}.enabled`] === true;
	const softAction = Number(row[`${prefix}.soft-action`] ?? 0);
	const hardAction = Number(row[`${prefix}.hard-action`] ?? 0);
	const duration = Number(row[`${prefix}.hard-action-duration`] ?? 0);
	const thresholdMaximum = Number(row[`${prefix}.threshold-maximum`] ?? DefaultThreshold.maximum);
	const thresholdDuration = Number(row[`${prefix}.threshold-duration`] ?? DefaultThreshold.duration);
	const ignoredRoles = readSnowflakes(row, `${prefix}.ignored-roles`);
	const ignoredChannels = readSnowflakes(row, `${prefix}.ignored-channels`);
	const given = source.options(row, key);
	const options = normalizeAutoModerationRuleOptions(type, given);

	const customised =
		enabled ||
		softAction !== 0 ||
		hardAction !== 0 ||
		duration !== 0 ||
		thresholdMaximum !== DefaultThreshold.maximum ||
		thresholdDuration !== DefaultThreshold.duration ||
		ignoredRoles.length > 0 ||
		ignoredChannels.length > 0 ||
		JSON.stringify(options) !== JSON.stringify(getDefaultAutoModerationRuleOptions(type));
	if (!customised) return null;

	const { maximum } = AutoModerationRuleLimits.hardActionDuration;
	if (duration > maximum) warnings.push(`The punishment of the rule "${name}" was cut to ${maximum} milliseconds.`);
	warnChangedOptions(name, given, options, warnings);

	const threshold = clamp(thresholdMaximum, AutoModerationRuleLimits.thresholdMaximum);
	if (threshold !== thresholdMaximum) warnings.push(`The threshold of the rule "${name}" was changed from ${thresholdMaximum} to ${threshold}.`);

	return {
		guild_id: guildId,
		name,
		type,
		enabled,
		soft_action: softAction,
		hard_action: HardActions[hardAction] ?? 'None',
		hard_action_duration: duration === 0 ? null : Math.min(duration, maximum),
		threshold_maximum: threshold,
		threshold_duration: clamp(thresholdDuration, AutoModerationRuleLimits.thresholdDuration),
		ignored_roles: ignoredRoles,
		ignored_channels: [...new Set([...ignoredChannels, ...ignoredEverywhere])],
		options
	};
}

/**
 * The mention spam filter, as `20261029T1302_merge_mention_spam_rules` rewrote the rules that came from it.
 */
function convertMentionSpam(row: LegacyRow, guildId: string, ignoredChannels: readonly string[], warnings: string[]) {
	const enabled = row['no-mention-spam.enabled'] === true;
	const alerts = row['no-mention-spam.alerts'] === true;
	const options = { maximum: row['no-mention-spam.mentions-allowed'], timePeriod: row['no-mention-spam.time-period'], weighted: true };
	if (!enabled && !alerts && options.maximum === 20 && options.timePeriod === 8) return null;

	const normalized = normalizeAutoModerationRuleOptions('MentionsCooldown', options);
	warnChangedOptions('Mention spam', options, normalized, warnings);

	return {
		guild_id: guildId,
		name: 'Mention spam',
		type: 'MentionsCooldown',
		enabled,
		soft_action: AlertBit,
		hard_action: 'Ban',
		hard_action_duration: null,
		threshold_maximum: 0,
		threshold_duration: DefaultThreshold.duration,
		ignored_roles: [],
		ignored_channels: [...ignoredChannels],
		options: normalized
	};
}

/**
 * Converts the auto-moderation of a guild into rules: one for each configuration that is enabled or was customised.
 *
 * @param row - The row of the legacy `guilds` table.
 * @param guildId - The guild.
 */
export function convertLegacyAutomodRules(row: LegacyRow, guildId: string): { rules: InsertRow[]; warnings: string[] } {
	const warnings: string[] = [];
	const ignoredEverywhere = readSnowflakes(row, 'selfmod.ignored-channels');

	const candidates = [
		...LegacyRules.map((source) => convertRule(row, guildId, ignoredEverywhere, source, warnings)),
		convertMentionSpam(row, guildId, ignoredEverywhere, warnings)
	];

	return { rules: candidates.filter((rule) => rule !== null), warnings };
}
