import { getDefaultGuildSettings } from '#lib/database/settings/constants';
import type { GuildData, GuildDataKey, MentionsOverride, ReadonlyGuildData } from '#lib/database/settings/types';
import { container } from '@sapphire/framework';
import type { Snowflake } from 'discord.js';
import type { Database } from 'wolfstar-database';

/**
 * The tables a guild's settings are spread across, in foreign-key order: every table references the one it follows
 * (`Modules` → `Guild`, `GuildAutoModeration` → `Modules`, `GuildAutoModerationLinks` → `GuildAutoModeration`, …),
 * so creating them in this order always satisfies the constraints.
 */
const Tables = [
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

type TableName = (typeof Tables)[number];

/**
 * How a value is converted between {@link GuildData} and its column:
 * - `value`: stored as-is (strings, numbers, booleans, enums, JSON);
 * - `snowflake`: a nullable `BigInt` column, a `string | null` setting;
 * - `snowflakes`: a `BigInt[]` column, a `string[]` setting;
 * - `boolean`: a nullable `Boolean` column (`enabled`) read as `false` when unset.
 */
type ColumnKind = 'value' | 'snowflake' | 'snowflakes' | 'boolean';

interface Column {
	table: TableName;
	column: string;
	kind: ColumnKind;
}

type StoredKey = Exclude<GuildDataKey, 'id' | 'selfmodMentionsOverrides'>;

function autoModerationRule(table: TableName, prefix: string, extra: Record<string, Column> = {}): Record<string, Column> {
	return {
		[`${prefix}Enabled`]: { table, column: 'enabled', kind: 'boolean' },
		[`${prefix}SoftAction`]: { table, column: 'softAction', kind: 'value' },
		[`${prefix}HardAction`]: { table, column: 'hardAction', kind: 'value' },
		[`${prefix}HardActionDuration`]: { table, column: 'hardActionDuration', kind: 'value' },
		[`${prefix}ThresholdMaximum`]: { table, column: 'thresholdMaximum', kind: 'value' },
		[`${prefix}ThresholdDuration`]: { table, column: 'thresholdDuration', kind: 'value' },
		[`${prefix}IgnoredRoles`]: { table, column: 'ignoredRoles', kind: 'snowflakes' },
		[`${prefix}IgnoredChannels`]: { table, column: 'ignoredChannels', kind: 'snowflakes' },
		...extra
	};
}

function columns(table: TableName, entries: Record<string, [column: string, kind: ColumnKind]>): Record<string, Column> {
	return Object.fromEntries(Object.entries(entries).map(([key, [column, kind]]) => [key, { table, column, kind }]));
}

const Columns = {
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
		commandsDisabledChannels: ['disabledChannels', 'snowflakes'],
		commandsDisabledInChannels: ['disabledInChannels', 'value']
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
		logsReaction: ['reaction', 'snowflake'],
		logsRoleCreate: ['roleCreate', 'snowflake'],
		logsRoleUpdate: ['roleUpdate', 'snowflake'],
		logsRoleDelete: ['roleDelete', 'snowflake'],
		logsChannelCreate: ['channelCreate', 'snowflake'],
		logsChannelUpdate: ['channelUpdate', 'snowflake'],
		logsChannelDelete: ['channelDelete', 'snowflake'],
		logsEmojiCreate: ['emojiCreate', 'snowflake'],
		logsEmojiUpdate: ['emojiUpdate', 'snowflake'],
		logsEmojiDelete: ['emojiDelete', 'snowflake'],
		logsEmojiAdd: ['emojiAdd', 'snowflake'],
		logsEmojiAddIncludeTwemoji: ['emojiAddIncludeTwemoji', 'value'],
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
} as Record<StoredKey, Column>;

const StoredKeys = Object.keys(Columns) as StoredKey[];

/**
 * The ORM surface of a table as the storage layer uses it. The tables are addressed by name, so the typed per-model
 * collections are narrowed to the three terminals every one of them shares.
 */
interface TableCollection {
	first(criteria: { id: bigint }): PromiseLike<Record<string, unknown> | null>;
	upsert(input: { create: Record<string, unknown>; update: Record<string, unknown> }): PromiseLike<unknown>;
}

type Orm = Database['orm'];

function table(orm: Pick<Orm, 'public'>, name: TableName): TableCollection {
	return orm.public[name] as unknown as TableCollection;
}

function toSetting(kind: ColumnKind, value: unknown): unknown {
	switch (kind) {
		case 'snowflake':
			return value === null || value === undefined ? null : String(value);
		case 'snowflakes':
			return (value as readonly bigint[]).map(String);
		case 'boolean':
			return value === true;
		case 'value':
			return value;
	}
}

function toColumn(kind: ColumnKind, value: unknown): unknown {
	switch (kind) {
		case 'snowflake':
			return value === null || value === undefined ? null : BigInt(value as string);
		case 'snowflakes':
			return (value as readonly string[]).map((entry) => BigInt(entry));
		case 'boolean':
		case 'value':
			return value;
	}
}

/**
 * Reads the settings of a guild.
 * @param orm The ORM surface to read through, `container.prisma.orm` or a transaction's `tx.orm`.
 * @param id The guild's ID.
 * @returns The settings, or `null` when the guild has no `Guild` row yet.
 */
export async function fetchGuildData(orm: Orm, id: Snowflake): Promise<GuildData | null> {
	const key = BigInt(id);
	const [rows, overrides] = await Promise.all([
		Promise.all(Tables.map((name) => table(orm, name).first({ id: key }))),
		orm.public.GuildAutoModerationMentionsOverrides.where({ parentId: key }).all()
	]);

	const [guild] = rows;
	if (guild === null) return null;

	const data = Object.assign(Object.create(null), getDefaultGuildSettings(), { id }) as GuildData;
	const byTable = new Map<TableName, Record<string, unknown> | null>(Tables.map((name, index) => [name, rows[index]]));
	for (const settingKey of StoredKeys) {
		const { table: tableName, column, kind } = Columns[settingKey];
		const row = byTable.get(tableName);
		// A missing row keeps the default values for every key the table stores:
		if (!row) continue;
		Reflect.set(data, settingKey, toSetting(kind, row[column]));
	}

	data.selfmodMentionsOverrides = overrides.map(
		(override) =>
			({
				roles: override.roles.map(String),
				users: override.users.map(String),
				points: override.points
			}) satisfies MentionsOverride
	);

	return data;
}

/**
 * Writes changed settings into their tables, in one transaction. The rows a change needs are created with the rest of
 * {@link settings} when they do not exist yet, together with the rows they reference.
 * @param settings The settings the changes apply to, with the changes already merged in.
 * @param changes The changed keys and their new values.
 */
export async function writeGuildData(settings: ReadonlyGuildData, changes: Partial<ReadonlyGuildData>): Promise<void> {
	const id = BigInt(settings.id);
	const changedKeys = Object.keys(changes) as GuildDataKey[];

	const touched = new Set<TableName>();
	for (const key of changedKeys) {
		if (key === 'id') continue;
		if (key === 'selfmodMentionsOverrides') touched.add('GuildAutoModerationMentions');
		else touched.add(Columns[key].table);
	}

	if (touched.size === 0) return;

	// Every table references the chain above it, so the whole chain has to exist first:
	touched.add('Guild');
	if (touched.size > 1) touched.add('Modules');
	if ([...touched].some((name) => name.startsWith('GuildAutoModeration'))) touched.add('GuildAutoModeration');

	await container.prisma.transaction(async (tx) => {
		for (const name of Tables) {
			if (!touched.has(name)) continue;

			const create: Record<string, unknown> = { id };
			const update: Record<string, unknown> = {};
			for (const key of StoredKeys) {
				const { table: tableName, column, kind } = Columns[key];
				if (tableName !== name) continue;

				const value = toColumn(kind, settings[key]);
				create[column] = value;
				if (key in changes) update[column] = value;
			}

			await table(tx.orm, name).upsert({ create, update });
		}

		if ('selfmodMentionsOverrides' in changes) {
			const overrides = tx.orm.public.GuildAutoModerationMentionsOverrides;
			await overrides.where({ parentId: id }).deleteAndCount();
			if (settings.selfmodMentionsOverrides.length > 0) {
				await overrides.createAndCount(
					settings.selfmodMentionsOverrides.map((override) => ({
						parentId: id,
						roles: override.roles.map((role) => BigInt(role)),
						users: override.users.map((user) => BigInt(user)),
						points: override.points
					}))
				);
			}
		}
	});
}
