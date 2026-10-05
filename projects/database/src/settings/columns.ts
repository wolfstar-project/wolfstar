import type { models } from '../generated/prisma/contract.js';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The tables a guild's settings are spread across, in foreign-key order: every table references the one it follows
 * (`Modules` → `Guild`, `GuildAutoModeration` → `Modules`, `GuildAutoModerationLinks` → `GuildAutoModeration`, …),
 * so creating them in this order always satisfies the constraints.
 */
export const Tables = [
	'Guild',
	'Modules',
	'GuildAutoModeration',
	'GuildAutoModerationAttachments',
	'GuildAutoModerationCapitals',
	'GuildAutoModerationInvites',
	'GuildAutoModerationLinks',
	'GuildAutoModerationMentions',
	'GuildAutoModerationNewlines',
	'GuildAutoModerationNoMentionSpam',
	'GuildAutoModerationWords',
	'GuildCommands',
	'GuildLogs',
	'GuildModeration',
	'GuildPermissions',
	'GuildRoles'
] as const;

export type TableName = (typeof Tables)[number];

/**
 * The row of a table, as the contract types it.
 */
export type TableRow<Table extends TableName> = (typeof models)['public'][Table];

/**
 * How a value is converted between a setting and its column:
 * - `value`: stored as-is (strings, numbers, booleans, enums, JSON);
 * - `snowflake`: a nullable `BigInt` column, a `string | null` setting;
 * - `snowflakes`: a `BigInt[]` column, a `string[]` setting;
 * - `boolean`: a nullable `Boolean` column (`enabled`) read as `false` when unset.
 */
export type ColumnKind = 'value' | 'snowflake' | 'snowflakes' | 'boolean';

export interface Column<Table extends TableName = TableName, Name extends string = string, Kind extends ColumnKind = ColumnKind> {
	table: Table;
	column: Name;
	kind: Kind;
}

/**
 * The type a setting has for the type of its column and the way it is converted. A kind that does not fit the column
 * (a `snowflake` on a column that is not a `BigInt`, …) gives `never`, so the mistake shows where the setting is used.
 */
export type SettingValue<Value, Kind extends ColumnKind> = Kind extends 'snowflake'
	? [Value] extends [bigint | null]
		? Snowflake | Extract<Value, null>
		: never
	: Kind extends 'snowflakes'
		? [Value] extends [readonly bigint[]]
			? Snowflake[]
			: never
		: Kind extends 'boolean'
			? [Value] extends [boolean | null]
				? boolean
				: never
			: Value extends ReadonlyArray<infer Element>
				? Element[]
				: Value;

/**
 * The columns every auto-moderation rule table has, by the suffix of their settings.
 */
const RuleColumns = {
	Enabled: ['enabled', 'boolean'],
	SoftAction: ['softAction', 'value'],
	HardAction: ['hardAction', 'value'],
	HardActionDuration: ['hardActionDuration', 'value'],
	ThresholdMaximum: ['thresholdMaximum', 'value'],
	ThresholdDuration: ['thresholdDuration', 'value'],
	IgnoredRoles: ['ignoredRoles', 'snowflakes'],
	IgnoredChannels: ['ignoredChannels', 'snowflakes']
} as const;

type RuleColumnName = (typeof RuleColumns)[keyof typeof RuleColumns][0];

type RuleTableName = {
	[Table in TableName]: TableRow<Table> extends Record<RuleColumnName, unknown> ? Table : never;
}[TableName];

type ColumnEntries<Table extends TableName> = Record<
	string,
	readonly [column: Exclude<keyof TableRow<Table>, symbol | number | 'id'>, kind: ColumnKind]
>;

type ColumnsOf<Table extends TableName, Entries extends ColumnEntries<Table>> = {
	[Key in keyof Entries]: Column<Table, Entries[Key][0], Entries[Key][1]>;
};

type RuleColumnsOf<Table extends RuleTableName, Prefix extends string> = {
	[Suffix in keyof typeof RuleColumns as `${Prefix}${Suffix}`]: Column<Table, (typeof RuleColumns)[Suffix][0], (typeof RuleColumns)[Suffix][1]>;
};

/**
 * Maps settings to columns of a table. The columns are checked against the contract: a name the table does not have
 * does not compile.
 */
function columns<const Table extends TableName, const Entries extends ColumnEntries<Table>>(table: Table, entries: Entries) {
	return Object.fromEntries(Object.entries(entries).map(([key, [column, kind]]) => [key, { table, column, kind }])) as ColumnsOf<Table, Entries>;
}

function autoModerationRule<const Table extends RuleTableName, const Prefix extends string>(
	table: Table,
	prefix: Prefix
): RuleColumnsOf<Table, Prefix>;
function autoModerationRule<const Table extends RuleTableName, const Prefix extends string, Extra extends object>(
	table: Table,
	prefix: Prefix,
	extra: Extra
): RuleColumnsOf<Table, Prefix> & Extra;
function autoModerationRule(table: RuleTableName, prefix: string, extra: object = {}) {
	const rule = Object.fromEntries(Object.entries(RuleColumns).map(([suffix, [column, kind]]) => [`${prefix}${suffix}`, { table, column, kind }]));
	return { ...rule, ...extra };
}

/**
 * Where every setting of a guild is stored. The settings of `GuildData` and their types come from this map and from
 * the contract: to add one, add its column here, its default in `./constants.ts` and its key in the
 * `configuration.ts` of the bot.
 */
export const Columns = {
	...columns('Guild', { language: ['language', 'value'] }),
	...columns('Modules', {
		modulesAutomod: ['automod', 'value'],
		modulesModeration: ['moderation', 'value'],
		modulesLogs: ['logs', 'value'],
		modulesCommands: ['commands', 'value'],
		modulesRoles: ['roles', 'value']
	}),
	...columns('GuildAutoModeration', {
		automodChannel: ['channelId', 'snowflake'],
		automodTrackNative: ['trackNative', 'value']
	}),
	...autoModerationRule('GuildAutoModerationAttachments', 'selfmodAttachments'),
	...autoModerationRule(
		'GuildAutoModerationCapitals',
		'selfmodCapitals',
		columns('GuildAutoModerationCapitals', {
			selfmodCapitalsMinimum: ['minimum', 'value'],
			selfmodCapitalsMaximum: ['maximum', 'value']
		})
	),
	...autoModerationRule(
		'GuildAutoModerationInvites',
		'selfmodInvites',
		columns('GuildAutoModerationInvites', {
			selfmodInvitesAllowedCodes: ['allowedCodes', 'value'],
			selfmodInvitesAllowedGuilds: ['allowedGuilds', 'snowflakes']
		})
	),
	...autoModerationRule(
		'GuildAutoModerationLinks',
		'selfmodLinks',
		columns('GuildAutoModerationLinks', { selfmodLinksAllowed: ['allowed', 'value'] })
	),
	...autoModerationRule('GuildAutoModerationMentions', 'selfmodMentions'),
	...autoModerationRule(
		'GuildAutoModerationNewlines',
		'selfmodNewlines',
		columns('GuildAutoModerationNewlines', { selfmodNewlinesMaximum: ['maximum', 'value'] })
	),
	...autoModerationRule(
		'GuildAutoModerationNoMentionSpam',
		'noMentionSpam',
		columns('GuildAutoModerationNoMentionSpam', {
			noMentionSpamAlerts: ['alerts', 'value'],
			noMentionSpamMentionsAllowed: ['mentionsAllowed', 'value'],
			noMentionSpamTimePeriod: ['timePeriod', 'value']
		})
	),
	...autoModerationRule('GuildAutoModerationWords', 'selfmodWords', columns('GuildAutoModerationWords', { selfmodWordsList: ['words', 'value'] })),
	...columns('GuildCommands', {
		commandsDisabled: ['disabled', 'value'],
		commandsDisabledChannels: ['disabledChannels', 'snowflakes']
	}),
	...columns('GuildLogs', {
		logsMemberAdd: ['memberAdd', 'snowflake'],
		logsMemberRemove: ['memberRemove', 'snowflake'],
		logsMemberNicknameUpdate: ['memberNicknameUpdate', 'snowflake'],
		logsMemberUsernameUpdate: ['memberUsernameUpdate', 'snowflake'],
		logsMessageDelete: ['messageDelete', 'snowflake'],
		logsMessageDeleteNsfw: ['messageDeleteNsfw', 'snowflake'],
		logsMessageUpdate: ['messageUpdate', 'snowflake'],
		logsMessageUpdateNsfw: ['messageUpdateNsfw', 'snowflake'],
		logsPrune: ['prune', 'snowflake'],
		logsReactionEmojiAdd: ['reactionEmojiAdd', 'snowflake'],
		logsReactionEmojiRemove: ['reactionEmojiRemove', 'snowflake'],
		logsReactionEmojiIncludeTwemoji: ['reactionEmojiIncludeTwemoji', 'value'],
		logsImage: ['image', 'snowflake'],
		logsRoleCreate: ['roleCreate', 'snowflake'],
		logsRoleUpdate: ['roleUpdate', 'snowflake'],
		logsRoleDelete: ['roleDelete', 'snowflake'],
		logsChannelCreate: ['channelCreate', 'snowflake'],
		logsChannelUpdate: ['channelUpdate', 'snowflake'],
		logsChannelDelete: ['channelDelete', 'snowflake'],
		logsEmojiCreate: ['emojiCreate', 'snowflake'],
		logsEmojiUpdate: ['emojiUpdate', 'snowflake'],
		logsEmojiDelete: ['emojiDelete', 'snowflake'],
		logsServerUpdate: ['serverUpdate', 'snowflake'],
		logsCommand: ['command', 'snowflake'],
		logsSettings: ['settings', 'snowflake'],
		logsIgnoreAll: ['ignoreAll', 'snowflakes'],
		logsIgnoreMessages: ['ignoreMessages', 'snowflakes'],
		logsIgnoreReactions: ['ignoreReactions', 'snowflakes']
	}),
	...columns('GuildModeration', {
		moderationChannel: ['channelId', 'snowflake'],
		moderationTrackBans: ['trackBans', 'value'],
		moderationTrackTimeouts: ['trackTimeouts', 'value']
	}),
	...columns('GuildPermissions', {
		permissionsUsers: ['users', 'value'],
		permissionsRoles: ['roles', 'value']
	}),
	...columns('GuildRoles', {
		rolesInitial: ['initial', 'snowflakes'],
		rolesInitialHumans: ['initialHumans', 'snowflakes'],
		rolesInitialRobots: ['initialRobots', 'snowflakes'],
		rolesAdmin: ['admin', 'snowflakes'],
		rolesModerator: ['moderator', 'snowflakes'],
		rolesMuted: ['muted', 'snowflake'],
		rolesPublic: ['public', 'snowflakes'],
		rolesRemoveInitial: ['removeInitial', 'value'],
		rolesUniqueRoleSets: ['uniqueRoleSets', 'value'],
		rolesRestrictedReaction: ['restrictedReaction', 'snowflake'],
		rolesRestrictedEmbed: ['restrictedEmbed', 'snowflake'],
		rolesRestrictedEmoji: ['restrictedEmoji', 'snowflake'],
		rolesRestrictedAttachment: ['restrictedAttachment', 'snowflake'],
		rolesRestrictedVoice: ['restrictedVoice', 'snowflake']
	})
};

type ColumnsMap = typeof Columns;

/**
 * A setting that is stored in a column of one of the {@link Tables}.
 */
export type StoredKey = keyof ColumnsMap;

/**
 * The settings stored in a column, typed from the column of the contract each one maps to.
 */
export type StoredGuildData = {
	-readonly [Key in StoredKey]: ColumnsMap[Key] extends Column<infer Table, infer Name, infer Kind>
		? Name extends keyof TableRow<Table>
			? SettingValue<TableRow<Table>[Name], Kind>
			: never
		: never;
};
