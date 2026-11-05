import { convertLegacyAutomodRules, LegacyValueError, type LegacyRow } from 'wolfstar-database';

/**
 * The settings of the bot before V7 that this one has under another name, by their old name. The export of that bot
 * writes them in a file of version 1, which an import reads to move a server to this one.
 *
 * @remarks `events.ban-add` and `events.ban-remove` are one setting here, which is on when either was, as the
 * migration of the database does.
 */
const RenamedSettings: Readonly<Record<string, string>> = {
	'disabled-commands': 'commands.disabled',
	'events.ban-add': 'moderation.track-bans',
	'events.ban-remove': 'moderation.track-bans',
	'events.timeout': 'moderation.track-timeouts',
	'events.twemoji-reactions': 'logs.reaction-emoji-include-twemoji',
	'messages.moderation-dm': 'moderation.direct-message',
	'messages.moderation-reason-display': 'moderation.display-reason',
	'messages.moderation-message-display': 'moderation.display-message',
	'messages.moderator-name-display': 'moderation.display-moderator'
};

/**
 * The settings of the bot before V7 this one has nothing for, by their old name, with the value that bot gave them:
 * one that still has it was never changed, so there is nothing to tell about it.
 */
const SettingsWithoutEquivalent: Readonly<Record<string, unknown>> = {
	prefix: 'w!',
	'disable-natural-prefix': false,
	'events.include-bots': false,
	'events.unknown-messages': false,
	'messages.moderation-auto-delete': false,
	'messages.auto-delete.ignored-all': false,
	'messages.auto-delete.ignored-commands': []
};

/**
 * The filter of the reactions of the bot before V7, which this one has no rule for, with the value that bot gave each
 * of its settings.
 */
const ReactionFilterDefaults: Readonly<Record<string, unknown>> = {
	'selfmod.reactions.enabled': false,
	'selfmod.reactions.maximum': 10,
	'selfmod.reactions.soft-action': 0,
	'selfmod.reactions.hard-action': 0,
	'selfmod.reactions.hard-action-duration': null,
	'selfmod.reactions.threshold-maximum': 10,
	'selfmod.reactions.threshold-duration': 60_000
};

/**
 * The filters of the bot before V7 that are auto-moderation rules here, by the prefix of their settings, with the name
 * the rule takes (see `convertLegacyAutomodRules`).
 */
const ConvertedFilters: Readonly<Record<string, string>> = {
	'selfmod.attachments.': 'Attachments',
	'selfmod.capitals.': 'Capitals',
	'selfmod.links.': 'Links',
	'selfmod.invites.': 'Invites',
	'selfmod.newlines.': 'New lines',
	'selfmod.filter.': 'Words',
	'selfmod.messages.': 'Identical messages',
	'no-mention-spam.': 'Mention spam'
};

/**
 * Whether a setting is one of the bot before V7 that an import converts or tells about, instead of refusing it.
 */
export function isLegacySetting(name: string): boolean {
	return (
		name in RenamedSettings ||
		name in SettingsWithoutEquivalent ||
		name in ReactionFilterDefaults ||
		Object.keys(ConvertedFilters).some((prefix) => name.startsWith(prefix))
	);
}

/**
 * A setting of the bot before V7, under the name it has here.
 */
export interface LegacySettingConversion {
	/** The name the setting has here. */
	name: string;
	value: unknown;
	/** The names it had, which the problems with it are reported under. */
	from: string[];
}

/**
 * Why a setting of the bot before V7 is not imported, for the import to tell, translated.
 */
export type LegacyNotice =
	| { kind: 'noEquivalent'; from: string }
	| { kind: 'reactionFilter'; from: string }
	| { kind: 'ruleAdjusted'; rule: string; detail: string }
	| { kind: 'ruleFailed'; rule: string; from: string; detail: string };

/**
 * What the settings of the bot before V7 become.
 */
export interface LegacyConversion {
	settings: LegacySettingConversion[];
	/** The rules the filters become, as a rule of a file of this version holds them, to be validated as one. */
	rules: Record<string, unknown>[];
	notices: LegacyNotice[];
}

/**
 * Converts the settings of a file of the bot before V7 to the ones of this bot.
 *
 * @remarks
 *
 * - A setting that was renamed takes its new name, and is validated as a setting of this bot afterwards.
 * - The filters (`selfmod.*`, `no-mention-spam.*`) become auto-moderation rules, as `convertLegacyAutomodRules` makes
 *   them out of the database when it is migrated: one for each filter that was turned on or changed. What that
 *   conversion adjusts to the limits of this bot is told.
 * - A setting this bot has nothing for is told when it does not have the value of the bot before V7, so a change the
 *   administrator made is not lost without them knowing.
 *
 * @param section - The settings of the file this bot does not know, by their name.
 */
export function convertLegacySettings(section: Readonly<Record<string, unknown>>): LegacyConversion {
	const conversion: LegacyConversion = { settings: [], rules: [], notices: [] };
	const row: LegacyRow = {};

	for (const [name, value] of Object.entries(section)) {
		if (name in RenamedSettings) continue;

		if (name in SettingsWithoutEquivalent) {
			if (!isSameValue(value, SettingsWithoutEquivalent[name])) conversion.notices.push({ kind: 'noEquivalent', from: name });
		} else if (name in ReactionFilterDefaults) {
			// The filter is told once, whatever of it was changed:
			const told = conversion.notices.some((notice) => notice.kind === 'reactionFilter');
			if (!told && !isSameValue(value, ReactionFilterDefaults[name])) conversion.notices.push({ kind: 'reactionFilter', from: name });
		} else {
			row[name] = value;
		}
	}

	convertRenamedSettings(section, conversion);
	convertFilters(row, conversion);
	return conversion;
}

function convertRenamedSettings(section: Readonly<Record<string, unknown>>, conversion: LegacyConversion) {
	const byName = new Map<string, LegacySettingConversion>();
	for (const [from, name] of Object.entries(RenamedSettings)) {
		if (!(from in section)) continue;

		const value = section[from];
		const converted = byName.get(name);
		if (converted === undefined) {
			byName.set(name, { name, value, from: [from] });
			continue;
		}

		// The two settings of the bans are one here, on when either was:
		converted.from.push(from);
		converted.value = typeof converted.value === 'boolean' && typeof value === 'boolean' ? converted.value || value : value;
	}

	conversion.settings.push(...byName.values());
}

/**
 * What the converter reads of the mention spam filter when the file has nothing of it: the values the bot before V7 gave
 * it, which the converter takes for a filter nobody changed. Without them it makes a rule that is off out of nothing.
 */
const MentionSpamDefaults: LegacyRow = { 'no-mention-spam.mentions-allowed': 20, 'no-mention-spam.time-period': 8 };

/**
 * Converts the filters the file has, each one by itself: one that cannot be converted does not keep the others from
 * being imported, and a filter the file does not have is not converted at all, so a file that only has a few settings
 * leaves the rules of the server alone.
 */
function convertFilters(row: LegacyRow, conversion: LegacyConversion) {
	for (const [prefix, rule] of Object.entries(ConvertedFilters)) {
		const filter = Object.fromEntries(Object.entries(row).filter(([name]) => name.startsWith(prefix)));
		if (Object.keys(filter).length > 0) convertFilter(prefix, rule, filter, conversion);
	}
}

function convertFilter(prefix: string, rule: string, filter: LegacyRow, conversion: LegacyConversion) {
	let converted: ReturnType<typeof convertLegacyAutomodRules>;
	try {
		converted = convertLegacyAutomodRules({ ...MentionSpamDefaults, ...filter }, '0');
	} catch (error) {
		// A value that is not one the bot before V7 could hold, which this file was edited to have:
		if (!(error instanceof LegacyValueError)) throw error;

		const from = Object.keys(filter).find((name) => error.message.includes(`"${name}"`)) ?? prefix;
		conversion.notices.push({ kind: 'ruleFailed', rule, from, detail: error.message });
		return;
	}

	for (const made of converted.rules) {
		conversion.rules.push({
			name: made.name,
			type: made.type,
			enabled: made.enabled,
			softAction: made.soft_action,
			hardAction: made.hard_action,
			hardActionDuration: made.hard_action_duration,
			thresholdMaximum: made.threshold_maximum,
			thresholdDuration: made.threshold_duration,
			options: made.options
		});
	}

	for (const warning of converted.warnings) {
		// The rule is the last name in quotes: a warning about an option names the option before it:
		const name = [...warning.matchAll(/"([^"]+)"/g)].at(-1)?.[1] ?? '';
		conversion.notices.push({ kind: 'ruleAdjusted', rule: name, detail: warning });
	}
}

/**
 * The settings of the bot before V7 a filter is made of, so a rule that cannot be converted tells what to look at.
 *
 * @param rule - The name of the rule the filter becomes.
 */
export function getLegacyFilterPrefix(rule: string): string {
	return Object.entries(ConvertedFilters).find(([, name]) => name === rule)?.[0] ?? '';
}

function isSameValue(value: unknown, expected: unknown) {
	// A punishment of no duration was saved as `0` as well as `null`:
	if (value === 0 && expected === null) return true;
	return JSON.stringify(value ?? null) === JSON.stringify(expected);
}
