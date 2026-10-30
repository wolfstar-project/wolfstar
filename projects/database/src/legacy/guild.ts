import { convertLegacyAutomodRules } from './automod.js';
import { readSnowflake, readSnowflakes, readTexts, type InsertRow, type LegacyRow } from './types.js';

/**
 * The columns of the legacy `guilds` table that are not carried over, since V7 has nothing for them. Every other column
 * is read by {@linkcode convertLegacyGuild}: a test fails when a column is neither.
 */
export const NotCarriedColumns = [
	'prefix',
	'disable-natural-prefix',
	'channels.media-only',
	'command-auto-delete',
	'reaction-roles',
	'channels.logs.command',
	'channels.logs.member-roles-update',
	'channels.logs.settings',
	'channels.logs.voice-activity',
	'channels.ignore.voice-activity',
	'events.include-bots',
	'events.unknown-messages',
	'messages.auto-delete.ignored-all',
	'messages.auto-delete.ignored-channels',
	'messages.auto-delete.ignored-commands',
	'messages.auto-delete.ignored-roles',
	'messages.ignore-channels',
	'messages.moderation-auto-delete',
	'selfmod.reactions.allowed',
	'selfmod.reactions.blocked',
	'selfmod.reactions.enabled',
	'selfmod.reactions.hard-action',
	'selfmod.reactions.hard-action-duration',
	'selfmod.reactions.ignored-channels',
	'selfmod.reactions.ignored-roles',
	'selfmod.reactions.maximum',
	'selfmod.reactions.soft-action',
	'selfmod.reactions.threshold-duration',
	'selfmod.reactions.threshold-maximum'
] as const;

/** The columns of `GuildLogs` that hold a channel, by the column of `guilds` they come from. */
const LogChannels = {
	'channels.logs.image': 'image',
	'channels.logs.member-add': 'member_add',
	'channels.logs.member-remove': 'member_remove',
	'channels.logs.member-nickname-update': 'member_nickname_update',
	'channels.logs.member-username-update': 'member_username_update',
	'channels.logs.message-delete': 'message_delete',
	'channels.logs.message-delete-nsfw': 'message_delete_nsfw',
	'channels.logs.message-update': 'message_update',
	'channels.logs.message-update-nsfw': 'message_update_nsfw',
	'channels.logs.prune': 'prune',
	'channels.logs.reaction': 'reaction_emoji_add',
	'channels.logs.role-create': 'role_create',
	'channels.logs.role-update': 'role_update',
	'channels.logs.role-delete': 'role_delete',
	'channels.logs.channel-create': 'channel_create',
	'channels.logs.channel-update': 'channel_update',
	'channels.logs.channel-delete': 'channel_delete',
	'channels.logs.emoji-create': 'emoji_create',
	'channels.logs.emoji-update': 'emoji_update',
	'channels.logs.emoji-delete': 'emoji_delete',
	'channels.logs.server-update': 'server_update'
};

/** The columns of `GuildRoles` that hold a role. */
const RoleColumns = {
	'roles.muted': 'muted',
	'roles.restricted-reaction': 'restricted_reaction',
	'roles.restricted-embed': 'restricted_embed',
	'roles.restricted-emoji': 'restricted_emoji',
	'roles.restricted-attachment': 'restricted_attachment',
	'roles.restricted-voice': 'restricted_voice'
};

/**
 * What a guild of the legacy table becomes, by the table of the new schema each row goes to.
 */
export interface LegacyGuildRows {
	Guild: InsertRow[];
	Modules: InsertRow[];
	GuildCommands: InsertRow[];
	GuildLogs: InsertRow[];
	GuildModeration: InsertRow[];
	GuildPermissions: InsertRow[];
	GuildRoles: InsertRow[];
	StickyRole: InsertRow[];
	GuildAutoModerationRule: InsertRow[];
	/** What could not be kept as it was, for the log. */
	warnings: string[];
}

function fromColumns(row: LegacyRow, columns: Record<string, string>) {
	return Object.fromEntries(Object.entries(columns).map(([from, to]) => [to, readSnowflake(row, from)]));
}

/** A role that used to be one and is a list now. */
function toList(value: string | null) {
	return value === null ? [] : [value];
}

function convertLogs(row: LegacyRow, id: string): InsertRow {
	const ignoredByDeletions = new Set(readSnowflakes(row, 'channels.ignore.message-delete'));

	return {
		id,
		...fromColumns(row, LogChannels),
		reaction_emoji_include_twemoji: row['events.twemoji-reactions'] === true,
		ignore_all: readSnowflakes(row, 'channels.ignore.all'),
		// V7 has one list for both: a channel only one of them ignored keeps the logs it was sent.
		ignore_messages: readSnowflakes(row, 'channels.ignore.message-edit').filter((channel) => ignoredByDeletions.has(channel)),
		ignore_reactions: readSnowflakes(row, 'channels.ignore.reaction-add')
	};
}

function convertRoles(row: LegacyRow, id: string): InsertRow {
	return {
		id,
		...fromColumns(row, RoleColumns),
		initial: toList(readSnowflake(row, 'roles.initial')),
		initial_humans: toList(readSnowflake(row, 'roles.initial-humans')),
		initial_robots: toList(readSnowflake(row, 'roles.initial-bots')),
		admin: readSnowflakes(row, 'roles.admin'),
		moderator: readSnowflakes(row, 'roles.moderator'),
		public: readSnowflakes(row, 'roles.public'),
		remove_initial: row['roles.remove-initial'] === true,
		unique_role_sets: row['roles.unique-role-sets'] ?? []
	};
}

function convertStickyRoles(row: LegacyRow, id: string): InsertRow[] {
	const entries = (row['sticky-roles'] ?? []) as { user: string; roles: string[] }[];
	return entries
		.filter((entry) => entry.roles.length > 0)
		.map((entry) => ({
			user_id: readSnowflake({ user: entry.user }, 'user'),
			guild_id: id,
			role_ids: readSnowflakes({ roles: entry.roles }, 'roles')
		}));
}

/**
 * Converts a row of the legacy `guilds` table.
 *
 * @param row - The row.
 * @throws A `LegacyValueError` when a value cannot be converted.
 */
export function convertLegacyGuild(row: LegacyRow): LegacyGuildRows {
	const id = readSnowflake(row, 'id')!;
	const { rules, warnings } = convertLegacyAutomodRules(row, id);

	return {
		Guild: [{ id, language: row.language, updates_channel_id: readSnowflake(row, 'channels.updates') }],
		Modules: [{ id }],
		GuildCommands: [
			{
				id,
				disabled: readTexts(row, 'disabled-commands'),
				disabled_channels: readSnowflakes(row, 'disabled-channels'),
				disabled_in_channels: row['disabled-commands-channels'] ?? []
			}
		],
		GuildLogs: [convertLogs(row, id)],
		GuildModeration: [
			{
				id,
				channel_id: readSnowflake(row, 'channels.logs.moderation'),
				track_bans: row['events.ban-add'] === true || row['events.ban-remove'] === true,
				track_timeouts: row['events.timeout'] === true,
				direct_message: row['messages.moderation-dm'] === true,
				display_reason: row['messages.moderation-reason-display'] !== false,
				display_message: row['messages.moderation-message-display'] !== false,
				display_moderator: row['messages.moderator-name-display'] !== false
			}
		],
		GuildPermissions: [{ id, users: row['permissions.users'] ?? [], roles: row['permissions.roles'] ?? [] }],
		GuildRoles: [convertRoles(row, id)],
		StickyRole: convertStickyRoles(row, id),
		GuildAutoModerationRule: rules,
		warnings
	};
}
