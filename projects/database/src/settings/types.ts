import type { DeepReadonly, PickByValue } from '@sapphire/utilities';
import type { APIGuildMember } from 'discord-api-types/v10';
import type { Snowflake } from 'discord-api-types/v10';
import type { Models } from '../index.js';
import type { StoredGuildData } from './columns.js';

/** A Twemoji or a custom emoji, serialized the way the settings store it. */
export type SerializedEmoji = string & { __TYPE__: 'SerializedEmoji' };

/**
 * The hard action an auto-moderation rule takes, as the `GuildAutoModerationHardAction` enum stores it.
 */
export type AutoModerationHardAction = Models.public_GuildAutoModerationRule['hardAction'];

/**
 * The settings of a guild, flattened from the normalized Prisma 8 tables (`Guild`, `Modules`, `GuildRoles`, …).
 *
 * Every key is prefixed by the table it is stored in. The keys stored in a column, and their types, are derived from
 * the `Columns` map of `./columns.ts` and from the models of the contract; the one declared here is stored in a table
 * of its own. Snowflakes are kept as strings; they are converted from and to `bigint` at the storage boundary.
 */
export interface GuildData extends StoredGuildData {
	id: Snowflake;

	// StickyRole
	stickyRoles: StickyRole[];
}

export type GuildDataKey = keyof GuildData;
export type GuildDataValue = GuildData[GuildDataKey];

export type ReadonlyGuildData = DeepReadonly<GuildData>;
export type ReadonlyGuildDataValue = DeepReadonly<GuildDataValue>;

export type GuildSettingsOfType<T> = PickByValue<GuildData, T>;

export type CommandLogData = Models.public_CommandLog;
export type ModerationData = Models.public_ModerationAction;
export type UserData = Models.public_User;

export type DashboardAuditAction =
	| 'guild.settings.update'
	| 'guild.settings.add'
	| 'guild.settings.remove'
	| 'guild.settings.access-denied'
	| 'guild.command.execute';

export type AuditOutcome = 'success' | 'failure' | 'denied';

export interface DashboardAuditChanges {
	added?: Record<string, unknown>;
	removed?: Record<string, unknown>;
	changed?: Record<string, { from: unknown; to: unknown }>;
}

export interface AuditEventChanges {
	before?: Record<string, unknown>;
	after?: Record<string, unknown>;
}

export interface DashboardAuditEntry {
	id: string;
	guildId: string;
	action: DashboardAuditAction;
	outcome: AuditOutcome;
	member: APIGuildMember;
	changes: DashboardAuditChanges;
	reason: string | null;
	timestamp: string;
}

export interface PermissionsNode {
	allow: readonly Snowflake[];
	deny: readonly Snowflake[];
	id: Snowflake;
}

/**
 * An entry of the `reactionRoles` setting.
 */
export interface ReactionRole {
	emoji: SerializedEmoji;
	/**
	 * The message the reaction role is bound to, or `null` if it applies to every message of {@linkcode ReactionRole.channel}.
	 */
	message: Snowflake | null;
	channel: Snowflake;
	role: Snowflake;
}

export interface UniqueRoleSet {
	name: string;
	roles: readonly Snowflake[];
}

export interface StickyRole {
	roles: readonly Snowflake[];
	user: Snowflake;
}

declare global {
	namespace PrismaJson {
		type PermissionNodeEntries = PermissionsNode[];
		type UniqueRoleSetEntries = UniqueRoleSet[];
		type AuditEventChanges = import('./types.js').AuditEventChanges;
		type AutoModerationRuleOptions = import('./automod/types.js').AutoModerationRuleOptions;
	}
}
