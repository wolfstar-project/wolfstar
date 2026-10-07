import type { Snowflake } from 'discord-api-types/v10';
import type { AutoModerationHardAction } from '../settings/types.js';

/**
 * What a rule looks for in a message, as the `GuildAutoModerationRuleType` enum stores it.
 */
export const AutoModerationRuleTypes = ['Attachments', 'Capitals', 'Invites', 'Links', 'Newlines', 'NoMentionSpam', 'Words', 'Zalgo'] as const;
export type AutoModerationRuleType = (typeof AutoModerationRuleTypes)[number];

/**
 * The hard actions a rule can take, as the `GuildAutoModerationHardAction` enum stores them.
 */
export const AutoModerationHardActions = [
	'Warning',
	'Timeout',
	'Mute',
	'Kick',
	'Softban',
	'Ban',
	'VoiceKick'
] as const satisfies readonly AutoModerationHardAction[];

/**
 * The options of a rule, by its type. They are stored as JSON in the `options` column.
 */
export interface AutoModerationRuleOptionsMap {
	/** Every message with an attachment infringes the rule. */
	Attachments: Record<string, never>;
	/** Messages of at least `minimum` characters, of which at least `maximum` percent are capitals. */
	Capitals: { minimum: number; maximum: number };
	/** Invite links, but the ones to `allowedCodes` and to the guilds of `allowedGuilds`. */
	Invites: { allowedCodes: string[]; allowedGuilds: Snowflake[] };
	/** Links, but the ones to the `allowed` hostnames. */
	Links: { allowed: string[] };
	/** Messages of more than `maximum` lines. */
	Newlines: { maximum: number };
	/** More than `mentionsAllowed` points of mentions in `timePeriod` seconds, which bans; `alerts` warns before. */
	NoMentionSpam: { alerts: boolean; mentionsAllowed: number; timePeriod: number };
	/** Messages that hold one of the `words`. */
	Words: { words: string[] };
	/** Messages in which a character carries more than `maximum` combining marks. */
	Zalgo: { maximum: number };
}

export type AutoModerationRuleOptions = AutoModerationRuleOptionsMap[AutoModerationRuleType];

/**
 * A rule of the auto-moderation of a guild. A guild has as many as it wants of each type, each with its own options,
 * actions and exemptions. Snowflakes are strings, as in `GuildData`.
 */
export interface AutoModerationRule<Type extends AutoModerationRuleType = AutoModerationRuleType> {
	id: string;
	guildId: Snowflake;
	name: string;
	type: Type;
	enabled: boolean;
	/** The `AutoModerationOnInfraction` bits: delete, log, alert. */
	softAction: number;
	hardAction: AutoModerationHardAction;
	/** How long the hard action lasts, in milliseconds; `null` for a permanent one. */
	hardActionDuration: number | null;
	/** How many infractions within `thresholdDuration` milliseconds trigger the hard action; `0` for the first one. */
	thresholdMaximum: number;
	thresholdDuration: number;
	ignoredRoles: Snowflake[];
	ignoredChannels: Snowflake[];
	options: AutoModerationRuleOptionsMap[Type];
}

/**
 * What a rule is created or edited with.
 */
export type AutoModerationRuleData = Omit<AutoModerationRule, 'id' | 'guildId'>;

/** The most rules a guild can have. */
export const MaximumAutoModerationRules = 25;
export const MaximumAutoModerationRuleNameLength = 50;
/** The most entries a list of the options of a rule holds (words, allowed links, allowed invites). */
export const MaximumAutoModerationRuleListLength = 200;

/** The durations are stored in 32-bit integer columns, as milliseconds: a little under 25 days. */
const MaximumDuration = 2 ** 31 - 1;

export const AutoModerationRuleLimits = {
	hardActionDuration: { minimum: 0, maximum: MaximumDuration },
	thresholdMaximum: { minimum: 0, maximum: 100 },
	thresholdDuration: { minimum: 0, maximum: MaximumDuration }
} as const;

/**
 * The limits of the numbers of the options, by type and name.
 */
export const AutoModerationRuleOptionLimits = {
	Capitals: { minimum: { minimum: 5, maximum: 2000 }, maximum: { minimum: 10, maximum: 100 } },
	Newlines: { maximum: { minimum: 1, maximum: 100 } },
	NoMentionSpam: { mentionsAllowed: { minimum: 1, maximum: 200 }, timePeriod: { minimum: 1, maximum: 3600 } },
	Zalgo: { maximum: { minimum: 1, maximum: 20 } }
} as const;

/**
 * The length of a word of a `Words` rule: a single letter would match almost every message.
 */
export const AutoModerationRuleWordLength = { minimum: 2, maximum: 32 } as const;

/**
 * The options a rule of a type starts with.
 *
 * @param type - The type of the rule.
 */
export function getDefaultAutoModerationRuleOptions<Type extends AutoModerationRuleType>(type: Type): AutoModerationRuleOptionsMap[Type] {
	const defaults: AutoModerationRuleOptionsMap = {
		Attachments: {},
		Capitals: { minimum: 15, maximum: 50 },
		Invites: { allowedCodes: [], allowedGuilds: [] },
		Links: { allowed: [] },
		Newlines: { maximum: 20 },
		NoMentionSpam: { alerts: false, mentionsAllowed: 20, timePeriod: 8 },
		Words: { words: [] },
		Zalgo: { maximum: 4 }
	};
	return structuredClone(defaults[type]);
}

/**
 * What a rule starts with, besides its name and its type.
 *
 * @param type - The type of the rule.
 */
export function getDefaultAutoModerationRule<Type extends AutoModerationRuleType>(type: Type): Omit<AutoModerationRuleData, 'name'> {
	return {
		type,
		enabled: true,
		softAction: 0,
		hardAction: 'Warning',
		hardActionDuration: null,
		thresholdMaximum: 10,
		thresholdDuration: 60_000,
		ignoredRoles: [],
		ignoredChannels: [],
		options: getDefaultAutoModerationRuleOptions(type)
	};
}

/**
 * Whether a text is long enough, and short enough, to be a word of a `Words` rule.
 */
export function isAutoModerationRuleWord(word: string) {
	return word.length >= AutoModerationRuleWordLength.minimum && word.length <= AutoModerationRuleWordLength.maximum;
}

export function isAutoModerationRuleType(value: unknown): value is AutoModerationRuleType {
	return AutoModerationRuleTypes.includes(value as AutoModerationRuleType);
}

/**
 * Reads the options of a rule from data that is not trusted (the stored JSON, the body of a request): what is missing or
 * of the wrong type takes its default, the numbers are brought within their limits, and the lists lose their
 * duplicates and what is not a string. The words and the hostnames are lowercased, as the messages are matched, and a
 * word that is too short or too long is dropped.
 *
 * @param type - The type of the rule.
 * @param value - The data to read the options from.
 */
export function normalizeAutoModerationRuleOptions<Type extends AutoModerationRuleType>(
	type: Type,
	value: unknown
): AutoModerationRuleOptionsMap[Type] {
	const defaults = getDefaultAutoModerationRuleOptions(type) as Record<string, unknown>;
	const input = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
	const limits = (AutoModerationRuleOptionLimits as Record<string, Record<string, { minimum: number; maximum: number }> | undefined>)[type];

	const options: Record<string, unknown> = {};
	for (const [key, fallback] of Object.entries(defaults)) {
		const given = input[key];
		if (typeof fallback === 'number') {
			const limit = limits?.[key];
			const number = typeof given === 'number' && Number.isFinite(given) ? Math.trunc(given) : fallback;
			options[key] = limit ? Math.min(limit.maximum, Math.max(limit.minimum, number)) : number;
		} else if (typeof fallback === 'boolean') {
			options[key] = typeof given === 'boolean' ? given : fallback;
		} else {
			const list = (Array.isArray(given) ? given : [])
				.filter((entry): entry is string => typeof entry === 'string')
				.map((entry) => (type === 'Invites' ? entry.trim() : entry.trim().toLowerCase()))
				.filter((entry) => entry.length > 0 && (type !== 'Words' || isAutoModerationRuleWord(entry)));
			options[key] = [...new Set(list)].slice(0, MaximumAutoModerationRuleListLength);
		}
	}

	return options as AutoModerationRuleOptionsMap[Type];
}
