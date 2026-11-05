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

function convertFilters(row: LegacyRow, conversion: LegacyConversion) {
	let converted: ReturnType<typeof convertLegacyAutomodRules>;
	try {
		converted = convertLegacyAutomodRules(row, '0');
	} catch (error) {
		// A value that is not one the bot before V7 could hold, which this file was edited to have:
		if (!(error instanceof LegacyValueError)) throw error;

		const from = Object.keys(row).find((name) => error.message.includes(`"${name}"`)) ?? '';
		const rule = Object.entries(ConvertedFilters).find(([prefix]) => from.startsWith(prefix))?.[1] ?? from;
		conversion.notices.push({ kind: 'ruleFailed', rule, from, detail: error.message });
		return;
	}

	for (const rule of converted.rules) {
		conversion.rules.push({
			name: rule.name,
			type: rule.type,
			enabled: rule.enabled,
			softAction: rule.soft_action,
			hardAction: rule.hard_action,
			hardActionDuration: rule.hard_action_duration,
			thresholdMaximum: rule.threshold_maximum,
			thresholdDuration: rule.threshold_duration,
			options: rule.options
		});
	}

	for (const warning of converted.warnings) {
		const rule = /"([^"]+)"/.exec(warning)?.[1] ?? '';
		conversion.notices.push({ kind: 'ruleAdjusted', rule, detail: warning });
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
