import type { Guild as GuildData } from '#generated/prisma';
import type { DeepReadonly, PickByValue } from '@sapphire/utilities';
import type { APIGuildMember } from 'discord-api-types/v10';

export type GuildDataKey = keyof GuildData;
export type GuildDataValue = GuildData[GuildDataKey];

export type ReadonlyGuildData = DeepReadonly<GuildData>;
export type ReadonlyGuildDataValue = DeepReadonly<GuildDataValue>;

export type GuildSettingsOfType<T> = PickByValue<GuildData, T>;

import type { SerializedEmoji } from '#utils/functions';
import type { Snowflake } from 'discord.js';

export type { Guild as GuildData, Moderation as ModerationData, User as UserData } from '#generated/prisma';

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

export type CommandAutoDelete = readonly [Snowflake, number];

export interface DisabledCommandChannel {
	channel: Snowflake;
	commands: readonly Snowflake[];
}

export interface StickyRole {
	roles: readonly Snowflake[];
	user: Snowflake;
}

export interface ReactionRole {
	channel: Snowflake;
	emoji: SerializedEmoji;
	message: Snowflake | null;
	role: Snowflake;
}

export interface UniqueRoleSet {
	name: string;
	roles: readonly Snowflake[];
}
