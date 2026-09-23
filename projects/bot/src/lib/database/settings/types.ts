import type { DeepReadonly, PickByValue } from '@sapphire/utilities';
import type { APIGuildMember } from 'discord-api-types/v10';
import type { Snowflake } from 'discord.js';
import type { Models } from 'wolfstar-database';

/**
 * The hard action an auto-moderation rule takes, as the `GuildAutoModerationHardAction` enum stores it.
 */
export type AutoModerationHardAction = Models.public_GuildAutoModerationLinks['hardAction'];

/**
 * The settings of a guild, flattened from the normalized Prisma 8 tables (`Guild`, `Modules`, `GuildRoles`, …).
 *
 * Every key is prefixed by the table it is stored in, see `#lib/database/settings/storage` for the mapping.
 * Snowflakes are kept as strings; they are converted from and to `bigint` at the storage boundary.
 */
export interface GuildData {
	id: Snowflake;

	// Guild
	language: string;

	// Modules
	modulesAutomod: boolean;
	modulesModeration: boolean;
	modulesLogs: boolean;
	modulesCommands: boolean;
	modulesRoles: boolean;

	// GuildAutoModeration
	automodChannel: Snowflake | null;
	automodTrackNative: boolean;

	// GuildAutoModerationAttachments
	selfmodAttachmentsEnabled: boolean;
	selfmodAttachmentsSoftAction: number;
	selfmodAttachmentsHardAction: AutoModerationHardAction;
	selfmodAttachmentsHardActionDuration: number | null;
	selfmodAttachmentsThresholdMaximum: number;
	selfmodAttachmentsThresholdDuration: number;
	selfmodAttachmentsIgnoredRoles: Snowflake[];
	selfmodAttachmentsIgnoredChannels: Snowflake[];

	// GuildAutoModerationCapitals
	selfmodCapitalsEnabled: boolean;
	selfmodCapitalsSoftAction: number;
	selfmodCapitalsHardAction: AutoModerationHardAction;
	selfmodCapitalsHardActionDuration: number | null;
	selfmodCapitalsThresholdMaximum: number;
	selfmodCapitalsThresholdDuration: number;
	selfmodCapitalsMinimum: number;
	selfmodCapitalsMaximum: number;
	selfmodCapitalsIgnoredRoles: Snowflake[];
	selfmodCapitalsIgnoredChannels: Snowflake[];

	// GuildAutoModerationInvites
	selfmodInvitesEnabled: boolean;
	selfmodInvitesSoftAction: number;
	selfmodInvitesHardAction: AutoModerationHardAction;
	selfmodInvitesHardActionDuration: number | null;
	selfmodInvitesThresholdMaximum: number;
	selfmodInvitesThresholdDuration: number;
	selfmodInvitesAllowedCodes: string[];
	selfmodInvitesAllowedGuilds: Snowflake[];
	selfmodInvitesIgnoredRoles: Snowflake[];
	selfmodInvitesIgnoredChannels: Snowflake[];

	// GuildAutoModerationLinks
	selfmodLinksEnabled: boolean;
	selfmodLinksSoftAction: number;
	selfmodLinksHardAction: AutoModerationHardAction;
	selfmodLinksHardActionDuration: number | null;
	selfmodLinksThresholdMaximum: number;
	selfmodLinksThresholdDuration: number;
	selfmodLinksAllowed: string[];
	selfmodLinksIgnoredRoles: Snowflake[];
	selfmodLinksIgnoredChannels: Snowflake[];

	// GuildAutoModerationMentions (+ GuildAutoModerationMentionsOverrides)
	selfmodMentionsEnabled: boolean;
	selfmodMentionsSoftAction: number;
	selfmodMentionsHardAction: AutoModerationHardAction;
	selfmodMentionsHardActionDuration: number | null;
	selfmodMentionsThresholdMaximum: number;
	selfmodMentionsThresholdDuration: number;
	selfmodMentionsIgnoredRoles: Snowflake[];
	selfmodMentionsIgnoredChannels: Snowflake[];
	selfmodMentionsOverrides: MentionsOverride[];

	// GuildAutoModerationNewlines
	selfmodNewlinesEnabled: boolean;
	selfmodNewlinesSoftAction: number;
	selfmodNewlinesHardAction: AutoModerationHardAction;
	selfmodNewlinesHardActionDuration: number | null;
	selfmodNewlinesThresholdMaximum: number;
	selfmodNewlinesThresholdDuration: number;
	selfmodNewlinesMaximum: number;
	selfmodNewlinesIgnoredRoles: Snowflake[];
	selfmodNewlinesIgnoredChannels: Snowflake[];

	// GuildAutoModerationNoMentionSpam
	noMentionSpamEnabled: boolean;
	noMentionSpamSoftAction: number;
	noMentionSpamHardAction: AutoModerationHardAction;
	noMentionSpamHardActionDuration: number | null;
	noMentionSpamThresholdMaximum: number;
	noMentionSpamThresholdDuration: number;
	noMentionSpamAlerts: boolean;
	noMentionSpamMentionsAllowed: number;
	noMentionSpamTimePeriod: number;
	noMentionSpamIgnoredRoles: Snowflake[];
	noMentionSpamIgnoredChannels: Snowflake[];

	// GuildAutoModerationWords
	selfmodWordsEnabled: boolean;
	selfmodWordsSoftAction: number;
	selfmodWordsHardAction: AutoModerationHardAction;
	selfmodWordsHardActionDuration: number | null;
	selfmodWordsThresholdMaximum: number;
	selfmodWordsThresholdDuration: number;
	selfmodWordsList: string[];
	selfmodWordsIgnoredRoles: Snowflake[];
	selfmodWordsIgnoredChannels: Snowflake[];

	// GuildCommands
	commandsDisabled: string[];
	commandsDisabledChannels: Snowflake[];
	commandsDisabledInChannels: DisabledCommandChannel[];

	// GuildLogs
	logsMemberAdd: Snowflake | null;
	logsMemberRemove: Snowflake | null;
	logsMemberNicknameUpdate: Snowflake | null;
	logsMemberUsernameUpdate: Snowflake | null;
	logsMessageDelete: Snowflake | null;
	logsMessageDeleteNsfw: Snowflake | null;
	logsMessageUpdate: Snowflake | null;
	logsMessageUpdateNsfw: Snowflake | null;
	logsPrune: Snowflake | null;
	logsReaction: Snowflake | null;
	logsRoleCreate: Snowflake | null;
	logsRoleUpdate: Snowflake | null;
	logsRoleDelete: Snowflake | null;
	logsChannelCreate: Snowflake | null;
	logsChannelUpdate: Snowflake | null;
	logsChannelDelete: Snowflake | null;
	logsEmojiCreate: Snowflake | null;
	logsEmojiUpdate: Snowflake | null;
	logsEmojiDelete: Snowflake | null;
	logsEmojiAdd: Snowflake | null;
	logsEmojiAddIncludeTwemoji: boolean;
	logsServerUpdate: Snowflake | null;
	logsCommand: Snowflake | null;
	logsSettings: Snowflake | null;
	logsIgnoreAll: Snowflake[];
	logsIgnoreMessages: Snowflake[];
	logsIgnoreReactions: Snowflake[];

	// GuildModeration
	moderationChannel: Snowflake | null;
	moderationTrackBans: boolean;
	moderationTrackTimeouts: boolean;

	// GuildPermissions
	permissionsUsers: PermissionsNode[];
	permissionsRoles: PermissionsNode[];

	// GuildRoles
	rolesInitial: Snowflake[];
	rolesInitialHumans: Snowflake[];
	rolesInitialRobots: Snowflake[];
	rolesAdmin: Snowflake[];
	rolesModerator: Snowflake[];
	rolesMuted: Snowflake | null;
	rolesPublic: Snowflake[];
	rolesRemoveInitial: boolean;
	rolesUniqueRoleSets: UniqueRoleSet[];
	rolesRestrictedReaction: Snowflake | null;
	rolesRestrictedEmbed: Snowflake | null;
	rolesRestrictedEmoji: Snowflake | null;
	rolesRestrictedAttachment: Snowflake | null;
	rolesRestrictedVoice: Snowflake | null;
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

export interface DisabledCommandChannel {
	channel: Snowflake;
	commands: readonly Snowflake[];
}

export interface UniqueRoleSet {
	name: string;
	roles: readonly Snowflake[];
}

export interface MentionsOverride {
	roles: readonly Snowflake[];
	users: readonly Snowflake[];
	points: number;
}
