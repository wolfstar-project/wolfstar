import { ConfigurableKey, configurableKeys } from '#lib/database/settings/ConfigurableKey';
import type { IBaseEntity } from '#lib/database/settings/base/IBaseEntity';
import { AdderManager } from '#lib/database/settings/structures/AdderManager';
import { PermissionNodeManager } from '#lib/database/settings/structures/PermissionNodeManager';
import { kBigIntTransformer } from '#lib/database/utils/Transformers';
import { LanguageKeys } from '#lib/i18n/languageKeys';
import { getT } from '#lib/i18n/translate';
import { create } from '#utils/Security/RegexCreator';
import { minutes, years } from '#utils/common';
import type { SerializedEmoji } from '#utils/functions';
import { container } from '@sapphire/framework';
import type { TFunction } from '@sapphire/plugin-i18next';
import { RateLimitManager } from '@sapphire/ratelimits';
import { arrayStrictEquals, type NonNullObject, type PickByValue } from '@sapphire/utilities';
import type { LocaleString } from 'discord.js';
import { AfterInsert, AfterLoad, AfterRemove, AfterUpdate, BaseEntity, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('guilds', { schema: 'public' })
export class GuildEntity extends BaseEntity implements IBaseEntity {
	@PrimaryColumn('varchar', { name: 'id', length: 19 })
	public id!: string;

	@ConfigurableKey({ description: LanguageKeys.Settings.Prefix, minimum: 1, maximum: 10 })
	@Column('varchar', { name: 'prefix', length: 10, default: process.env.CLIENT_PREFIX })
	public prefix = process.env.CLIENT_PREFIX;

	@ConfigurableKey({ description: LanguageKeys.Settings.Language, type: 'language' })
	@Column('varchar', { name: 'language', default: 'en-US' })
	public language: LocaleString = 'en-US';

	@ConfigurableKey({ description: LanguageKeys.Settings.DisableNaturalPrefix })
	@Column('boolean', { name: 'disable-natural-prefix', default: false })
	public disableNaturalPrefix = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.DisabledCommands, type: 'commandmatch' })
	@Column('varchar', { name: 'disabled-commands', length: 32, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public disabledCommands: string[] = [];

	@Column('jsonb', { name: 'permissions.users', default: () => "'[]'::JSONB" })
	public permissionsUsers: PermissionsNode[] = [];

	@Column('jsonb', { name: 'permissions.roles', default: () => "'[]'::JSONB" })
	public permissionsRoles: PermissionsNode[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.MediaOnly, type: 'textchannel' })
	@Column('varchar', { name: 'channels.media-only', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public channelsMediaOnly: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.Moderation, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.moderation', nullable: true, length: 19 })
	public channelsLogsModeration?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.Image, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.image', nullable: true, length: 19 })
	public channelsLogsImage?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.MemberAdd, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.member-add', nullable: true, length: 19 })
	public channelsLogsMemberAdd?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.MemberRemove, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.member-remove', nullable: true, length: 19 })
	public channelsLogsMemberRemove?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.MemberNickNameUpdate, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.member-nickname-update', nullable: true, length: 19 })
	public channelsLogsMemberNickNameUpdate?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.MemberUserNameUpdate, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.member-username-update', nullable: true, length: 19 })
	public channelsLogsMemberUserNameUpdate?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.MemberRoleUpdate, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.member-roles-update', nullable: true, length: 19 })
	public channelsLogsMemberRolesUpdate?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.MessageDelete, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.message-delete', nullable: true, length: 19 })
	public channelsLogsMessageDelete?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.MessageDeleteNsfw, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.message-delete-nsfw', nullable: true, length: 19 })
	public channelsLogsMessageDeleteNsfw?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.MessageUpdate, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.message-update', nullable: true, length: 19 })
	public channelsLogsMessageUpdate?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.MessageUpdateNsfw, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.message-update-nsfw', nullable: true, length: 19 })
	public channelsLogsMessageUpdateNsfw?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.Prune, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.prune', nullable: true, length: 19 })
	public channelsLogsPrune?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.Reaction, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.reaction', nullable: true, length: 19 })
	public channelsLogsReaction?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.RoleCreate, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.role-create', nullable: true, length: 19 })
	public channelsLogsRoleCreate?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.RoleUpdate, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.role-update', nullable: true, length: 19 })
	public channelsLogsRoleUpdate?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.RoleDelete, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.role-delete', nullable: true, length: 19 })
	public channelsLogsRoleDelete?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.ChannelCreate, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.channel-create', nullable: true, length: 19 })
	public channelsLogsChannelCreate?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.ChannelUpdate, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.channel-update', nullable: true, length: 19 })
	public channelsLogsChannelUpdate?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.ChannelDelete, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.channel-delete', nullable: true, length: 19 })
	public channelsLogsChannelDelete?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.EmojiCreate, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.emoji-create', nullable: true, length: 19 })
	public channelsLogsEmojiCreate?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.EmojiUpdate, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.emoji-update', nullable: true, length: 19 })
	public channelsLogsEmojiUpdate?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.EmojiDelete, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.emoji-delete', nullable: true, length: 19 })
	public channelsLogsEmojiDelete?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.ServerUpdate, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.server-update', nullable: true, length: 19 })
	public channelsLogsServerUpdate?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Logs.VoiceActivity, type: 'textchannel' })
	@Column('varchar', { name: 'channels.logs.voice-activity', nullable: true, length: 19 })
	public channelsLogsVoiceChannel?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Ignore.All, type: 'textchannel' })
	@Column('varchar', { name: 'channels.ignore.all', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public channelsIgnoreAll: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Ignore.MessageEdit, type: 'textchannel' })
	@Column('varchar', { name: 'channels.ignore.message-edit', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public channelsIgnoreMessageEdits: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Ignore.MessageDelete, type: 'textchannel' })
	@Column('varchar', { name: 'channels.ignore.message-delete', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public channelsIgnoreMessageDeletes: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Ignore.ReactionAdd, type: 'textchannel' })
	@Column('varchar', { name: 'channels.ignore.reaction-add', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public channelsIgnoreReactionAdds: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.Channels.Ignore.VoiceActivity, type: 'voicechannel' })
	@Column('varchar', { name: 'channels.ignore.voice-activity', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public channelsIgnoreVoiceActivities: string[] = [];

	@Column('jsonb', { name: 'command-auto-delete', default: () => "'[]'::JSONB" })
	public commandAutoDelete: CommandAutoDelete[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.DisabledChannels, type: 'textchannel' })
	@Column('varchar', { name: 'disabled-channels', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public disabledChannels: string[] = [];

	@Column('jsonb', { name: 'disabled-commands-channels', default: () => "'[]'::JSONB" })
	public disabledCommandsChannels: DisabledCommandChannel[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.EventsBanAdd })
	@Column('boolean', { name: 'events.ban-add', default: false })
	public eventsBanAdd = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.EventsBanRemove })
	@Column('boolean', { name: 'events.ban-remove', default: false })
	public eventsBanRemove = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.EventsTimeout })
	@Column('boolean', { name: 'events.timeout', default: false })
	public eventsTimeout = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.EventsUnknownMessages })
	@Column('boolean', { name: 'events.unknown-messages', default: false })
	public eventsUnknownMessages = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.EventsTwemojiReactions })
	@Column('boolean', { name: 'events.twemoji-reactions', default: false })
	public eventsTwemojiReactions = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.EventsIncludeBots })
	@Column('boolean', { name: 'events.include-bots', default: false })
	public eventsIncludeBots = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.MessagesIgnoreChannels, type: 'textchannel' })
	@Column('varchar', { name: 'messages.ignore-channels', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public messagesIgnoreChannels: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.MessagesModerationDM })
	@Column('boolean', { name: 'messages.moderation-dm', default: false })
	public messagesModerationDm = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.MessagesModerationReasonDisplay })
	@Column('boolean', { name: 'messages.moderation-reason-display', default: true })
	public messagesModerationReasonDisplay = true;

	@ConfigurableKey({ description: LanguageKeys.Settings.MessagesModerationMessageDisplay })
	@Column('boolean', { name: 'messages.moderation-message-display', default: true })
	public messagesModerationMessageDisplay = true;

	@ConfigurableKey({ description: LanguageKeys.Settings.MessagesModerationAutoDelete })
	@Column('boolean', { name: 'messages.moderation-auto-delete', default: false })
	public messagesModerationAutoDelete = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.MessagesModeratorNameDisplay })
	@Column('boolean', { name: 'messages.moderator-name-display', default: true })
	public messagesModeratorNameDisplay = true;

	@ConfigurableKey({ description: LanguageKeys.Settings.MessagesAutoDeleteIgnoredAll })
	@Column('boolean', { name: 'messages.auto-delete.ignored-all', default: false })
	public messagesAutoDeleteIgnoredAll = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.MessagesAutoDeleteIgnoredRoles, type: 'role' })
	@Column('varchar', { name: 'messages.auto-delete.ignored-roles', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public messagesAutoDeleteIgnoredRoles: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.MessagesAutoDeleteIgnoredChannels, type: 'textchannel' })
	@Column('varchar', { name: 'messages.auto-delete.ignored-channels', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public messagesAutoDeleteIgnoredChannels: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.MessagesAutoDeleteIgnoredCommands, type: 'commandmatch' })
	@Column('varchar', { name: 'messages.auto-delete.ignored-commands', length: 32, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public messagesAutoDeleteIgnoredCommands: string[] = [];

	@Column('jsonb', { name: 'sticky-roles', default: () => "'[]'::JSONB" })
	public stickyRoles: StickyRole[] = [];

	@Column('jsonb', { name: 'reaction-roles', default: () => "'[]'::JSONB" })
	public reactionRoles: ReactionRole[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.RolesAdmin, type: 'role' })
	@Column('varchar', { name: 'roles.admin', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public rolesAdmin: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.RolesInitial, type: 'role' })
	@Column('varchar', { name: 'roles.initial', nullable: true, length: 19 })
	public rolesInitial?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.RolesInitialHumans, type: 'role' })
	@Column('varchar', { name: 'roles.initial-humans', nullable: true, length: 19 })
	public rolesInitialHumans?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.RolesInitialBots, type: 'role' })
	@Column('varchar', { name: 'roles.initial-bots', nullable: true, length: 19 })
	public rolesInitialBots?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.RolesModerator, type: 'role' })
	@Column('varchar', { name: 'roles.moderator', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public rolesModerator: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.RolesMuted, type: 'role' })
	@Column('varchar', { name: 'roles.muted', nullable: true, length: 19 })
	public rolesMuted?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.RolesRestrictedReaction, type: 'role' })
	@Column('varchar', { name: 'roles.restricted-reaction', nullable: true, length: 19 })
	public rolesRestrictedReaction?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.RolesRestrictedEmbed, type: 'role' })
	@Column('varchar', { name: 'roles.restricted-embed', nullable: true, length: 19 })
	public rolesRestrictedEmbed?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.RolesRestrictedEmoji, type: 'role' })
	@Column('varchar', { name: 'roles.restricted-emoji', nullable: true, length: 19 })
	public rolesRestrictedEmoji?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.RolesRestrictedAttachment, type: 'role' })
	@Column('varchar', { name: 'roles.restricted-attachment', nullable: true, length: 19 })
	public rolesRestrictedAttachment?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.RolesRestrictedVoice, type: 'role' })
	@Column('varchar', { name: 'roles.restricted-voice', nullable: true, length: 19 })
	public rolesRestrictedVoice?: string | null;

	@ConfigurableKey({ description: LanguageKeys.Settings.RolesPublic, type: 'role' })
	@Column('varchar', { name: 'roles.public', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public rolesPublic: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.RolesRemoveInitial })
	@Column('boolean', { name: 'roles.remove-initial', default: false })
	public rolesRemoveInitial = false;

	@Column('jsonb', { name: 'roles.unique-role-sets', default: () => "'[]'::JSONB" })
	public rolesUniqueRoleSets: UniqueRoleSet[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodAttachmentsEnabled })
	@Column('boolean', { name: 'selfmod.attachments.enabled', default: false })
	public selfmodAttachmentsEnabled = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodAttachmentsIgnoredRoles, type: 'role' })
	@Column('varchar', { name: 'selfmod.attachments.ignored-roles', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodAttachmentsIgnoredRoles: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodAttachmentsIgnoredChannels, type: 'textchannel' })
	@Column('varchar', { name: 'selfmod.attachments.ignored-channels', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodAttachmentsIgnoredChannels: string[] = [];

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.attachments.soft-action', default: 0 })
	public selfmodAttachmentsSoftAction = 0;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.attachments.hard-action', default: 0 })
	public selfmodAttachmentsHardAction = 0;

	@ConfigurableKey({
		dashboardOnly: true,
		type: 'timespan',
		description: LanguageKeys.Settings.DashboardOnlyKey,
		minimum: 0,
		maximum: years(5)
	})
	@Column('bigint', { name: 'selfmod.attachments.hard-action-duration', nullable: true, transformer: kBigIntTransformer })
	public selfmodAttachmentsHardActionDuration: number | null = null;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: 100 })
	@Column('smallint', { name: 'selfmod.attachments.threshold-maximum', default: 10 })
	public selfmodAttachmentsThresholdMaximum = 10;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: minutes(5) })
	@Column('integer', { name: 'selfmod.attachments.threshold-duration', default: 60000 })
	public selfmodAttachmentsThresholdDuration = 60000;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodCapitalsEnabled })
	@Column('boolean', { name: 'selfmod.capitals.enabled', default: false })
	public selfmodCapitalsEnabled = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodCapitalsIgnoredRoles, type: 'role' })
	@Column('varchar', { name: 'selfmod.capitals.ignored-roles', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodCapitalsIgnoredRoles: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodCapitalsIgnoredChannels, type: 'textchannel' })
	@Column('varchar', { name: 'selfmod.capitals.ignored-channels', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodCapitalsIgnoredChannels: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodCapitalsMinimum, minimum: 5, maximum: 2000 })
	@Column('smallint', { name: 'selfmod.capitals.minimum', default: 15 })
	public selfmodCapitalsMinimum = 15;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodCapitalsMaximum, minimum: 10, maximum: 100 })
	@Column('smallint', { name: 'selfmod.capitals.maximum', default: 50 })
	public selfmodCapitalsMaximum = 50;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.capitals.soft-action', default: 0 })
	public selfmodCapitalsSoftAction = 0;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.capitals.hard-action', default: 0 })
	public selfmodCapitalsHardAction = 0;

	@ConfigurableKey({
		dashboardOnly: true,
		type: 'timespan',
		description: LanguageKeys.Settings.DashboardOnlyKey,
		minimum: 0,
		maximum: years(5)
	})
	@Column('bigint', { name: 'selfmod.capitals.hard-action-duration', nullable: true, transformer: kBigIntTransformer })
	public selfmodCapitalsHardActionDuration: number | null = null;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: 100 })
	@Column('smallint', { name: 'selfmod.capitals.threshold-maximum', default: 10 })
	public selfmodCapitalsThresholdMaximum = 10;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: minutes(5) })
	@Column('integer', { name: 'selfmod.capitals.threshold-duration', default: 60000 })
	public selfmodCapitalsThresholdDuration = 60000;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodLinksEnabled })
	@Column('boolean', { name: 'selfmod.links.enabled', default: false })
	public selfmodLinksEnabled = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodLinksAllowed })
	@Column('varchar', { name: 'selfmod.links.allowed', length: 128, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodLinksAllowed: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodLinksIgnoredRoles, type: 'role' })
	@Column('varchar', { name: 'selfmod.links.ignored-roles', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodLinksIgnoredRoles: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodLinksIgnoredChannels, type: 'textchannel' })
	@Column('varchar', { name: 'selfmod.links.ignored-channels', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodLinksIgnoredChannels: string[] = [];

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.links.soft-action', default: 0 })
	public selfmodLinksSoftAction = 0;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.links.hard-action', default: 0 })
	public selfmodLinksHardAction = 0;

	@ConfigurableKey({
		dashboardOnly: true,
		type: 'timespan',
		description: LanguageKeys.Settings.DashboardOnlyKey,
		minimum: 0,
		maximum: years(5)
	})
	@Column('bigint', { name: 'selfmod.links.hard-action-duration', nullable: true, transformer: kBigIntTransformer })
	public selfmodLinksHardActionDuration: number | null = null;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: 100 })
	@Column('smallint', { name: 'selfmod.links.threshold-maximum', default: 10 })
	public selfmodLinksThresholdMaximum = 10;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: minutes(5) })
	@Column('integer', { name: 'selfmod.links.threshold-duration', default: 60000 })
	public selfmodLinksThresholdDuration = 60000;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodMessagesEnabled })
	@Column('boolean', { name: 'selfmod.messages.enabled', default: false })
	public selfmodMessagesEnabled = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodMessagesIgnoredRoles, type: 'role' })
	@Column('varchar', { name: 'selfmod.messages.ignored-roles', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodMessagesIgnoredRoles: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodMessagesIgnoredChannels, type: 'textchannel' })
	@Column('varchar', { name: 'selfmod.messages.ignored-channels', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodMessagesIgnoredChannels: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodMessagesMaximum, minimum: 2, maximum: 100 })
	@Column('smallint', { name: 'selfmod.messages.maximum', default: 5 })
	public selfmodMessagesMaximum = 5;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodMessagesQueueSize, minimum: 10, maximum: 100 })
	@Column('smallint', { name: 'selfmod.messages.queue-size', default: 50 })
	public selfmodMessagesQueueSize = 50;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.messages.soft-action', default: 0 })
	public selfmodMessagesSoftAction = 0;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.messages.hard-action', default: 0 })
	public selfmodMessagesHardAction = 0;

	@ConfigurableKey({
		dashboardOnly: true,
		type: 'timespan',
		description: LanguageKeys.Settings.DashboardOnlyKey,
		minimum: 0,
		maximum: years(5)
	})
	@Column('bigint', { name: 'selfmod.messages.hard-action-duration', nullable: true, transformer: kBigIntTransformer })
	public selfmodMessagesHardActionDuration: number | null = null;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: 100 })
	@Column('smallint', { name: 'selfmod.messages.threshold-maximum', default: 10 })
	public selfmodMessagesThresholdMaximum = 10;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: minutes(5) })
	@Column('integer', { name: 'selfmod.messages.threshold-duration', default: 60000 })
	public selfmodMessagesThresholdDuration = 60000;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodNewlinesEnabled })
	@Column('boolean', { name: 'selfmod.newlines.enabled', default: false })
	public selfmodNewlinesEnabled = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodNewlinesIgnoredRoles, type: 'role' })
	@Column('varchar', { name: 'selfmod.newlines.ignored-roles', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodNewlinesIgnoredRoles: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodNewlinesIgnoredChannels, type: 'textchannel' })
	@Column('varchar', { name: 'selfmod.newlines.ignored-channels', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodNewlinesIgnoredChannels: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodNewlinesMaximum, minimum: 10, maximum: 100 })
	@Column('smallint', { name: 'selfmod.newlines.maximum', default: 20 })
	public selfmodNewlinesMaximum = 20;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.newlines.soft-action', default: 0 })
	public selfmodNewlinesSoftAction = 0;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.newlines.hard-action', default: 0 })
	public selfmodNewlinesHardAction = 0;

	@ConfigurableKey({
		dashboardOnly: true,
		type: 'timespan',
		description: LanguageKeys.Settings.DashboardOnlyKey,
		minimum: 0,
		maximum: years(5)
	})
	@Column('bigint', { name: 'selfmod.newlines.hard-action-duration', nullable: true, transformer: kBigIntTransformer })
	public selfmodNewlinesHardActionDuration: number | null = null;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: 100 })
	@Column('smallint', { name: 'selfmod.newlines.threshold-maximum', default: 10 })
	public selfmodNewlinesThresholdMaximum = 10;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: minutes(5) })
	@Column('integer', { name: 'selfmod.newlines.threshold-duration', default: 60000 })
	public selfmodNewlinesThresholdDuration = 60000;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodInvitesEnabled })
	@Column('boolean', { name: 'selfmod.invites.enabled', default: false })
	public selfmodInvitesEnabled = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodInvitesIgnoredCodes })
	@Column('varchar', { name: 'selfmod.invites.ignored-codes', array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodInvitesIgnoredCodes: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodInvitesIgnoredGuilds })
	@Column('varchar', { name: 'selfmod.invites.ignored-guilds', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodInvitesIgnoredGuilds: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodInvitesIgnoredRoles, type: 'role' })
	@Column('varchar', { name: 'selfmod.invites.ignored-roles', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodInvitesIgnoredRoles: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodInvitesIgnoredChannels, type: 'textchannel' })
	@Column('varchar', { name: 'selfmod.invites.ignored-channels', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodInvitesIgnoredChannels: string[] = [];

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.invites.soft-action', default: 0 })
	public selfmodInvitesSoftAction = 0;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.invites.hard-action', default: 0 })
	public selfmodInvitesHardAction = 0;

	@ConfigurableKey({
		dashboardOnly: true,
		type: 'timespan',
		description: LanguageKeys.Settings.DashboardOnlyKey,
		minimum: 0,
		maximum: years(5)
	})
	@Column('bigint', { name: 'selfmod.invites.hard-action-duration', nullable: true, transformer: kBigIntTransformer })
	public selfmodInvitesHardActionDuration: number | null = null;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: 100 })
	@Column('smallint', { name: 'selfmod.invites.threshold-maximum', default: 10 })
	public selfmodInvitesThresholdMaximum = 10;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: minutes(5) })
	@Column('integer', { name: 'selfmod.invites.threshold-duration', default: 60000 })
	public selfmodInvitesThresholdDuration = 60000;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodFilterEnabled })
	@Column('boolean', { name: 'selfmod.filter.enabled', default: false })
	public selfmodFilterEnabled = false;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, type: 'word' })
	@Column('varchar', { name: 'selfmod.filter.raw', length: 32, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodFilterRaw: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodFilterIgnoredRoles, type: 'role' })
	@Column('varchar', { name: 'selfmod.filter.ignored-roles', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodFilterIgnoredRoles: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodFilterIgnoredChannels, type: 'textchannel' })
	@Column('varchar', { name: 'selfmod.filter.ignored-channels', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodFilterIgnoredChannels: string[] = [];

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.filter.soft-action', default: 0 })
	public selfmodFilterSoftAction = 0;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.filter.hard-action', default: 0 })
	public selfmodFilterHardAction = 0;

	@ConfigurableKey({
		dashboardOnly: true,
		type: 'timespan',
		description: LanguageKeys.Settings.DashboardOnlyKey,
		minimum: 0,
		maximum: years(5)
	})
	@Column('bigint', { name: 'selfmod.filter.hard-action-duration', nullable: true, transformer: kBigIntTransformer })
	public selfmodFilterHardActionDuration: number | null = null;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: 100 })
	@Column('smallint', { name: 'selfmod.filter.threshold-maximum', default: 10 })
	public selfmodFilterThresholdMaximum = 10;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: minutes(5) })
	@Column('integer', { name: 'selfmod.filter.threshold-duration', default: 60000 })
	public selfmodFilterThresholdDuration = 60000;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodReactionsEnabled })
	@Column('boolean', { name: 'selfmod.reactions.enabled', default: false })
	public selfmodReactionsEnabled = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodReactionsIgnoredRoles, type: 'role' })
	@Column('varchar', { name: 'selfmod.reactions.ignored-roles', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodReactionsIgnoredRoles: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodReactionsIgnoredChannels, type: 'textchannel' })
	@Column('varchar', { name: 'selfmod.reactions.ignored-channels', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodReactionsIgnoredChannels: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodReactionsMaximum, minimum: 1, maximum: 100 })
	@Column('smallint', { name: 'selfmod.reactions.maximum', default: 10 })
	public selfmodReactionsMaximum = 10;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodReactionsAllowed, type: 'emoji' })
	@Column('varchar', { name: 'selfmod.reactions.allowed', length: 128, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodReactionsAllowed: SerializedEmoji[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodReactionsBlocked, type: 'emoji' })
	@Column('varchar', { name: 'selfmod.reactions.blocked', length: 128, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodReactionsBlocked: SerializedEmoji[] = [];

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.reactions.soft-action', default: 0 })
	public selfmodReactionsSoftAction = 0;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey })
	@Column('smallint', { name: 'selfmod.reactions.hard-action', default: 0 })
	public selfmodReactionsHardAction = 0;

	@ConfigurableKey({
		dashboardOnly: true,
		type: 'timespan',
		description: LanguageKeys.Settings.DashboardOnlyKey,
		minimum: 0,
		maximum: years(5)
	})
	@Column('bigint', { name: 'selfmod.reactions.hard-action-duration', nullable: true, transformer: kBigIntTransformer })
	public selfmodReactionsHardActionDuration: number | null = null;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: 100 })
	@Column('smallint', { name: 'selfmod.reactions.threshold-maximum', default: 10 })
	public selfmodReactionsThresholdMaximum = 10;

	@ConfigurableKey({ dashboardOnly: true, description: LanguageKeys.Settings.DashboardOnlyKey, minimum: 0, maximum: minutes(5) })
	@Column('integer', { name: 'selfmod.reactions.threshold-duration', default: 60000 })
	public selfmodReactionsThresholdDuration = 60000;

	@ConfigurableKey({ description: LanguageKeys.Settings.SelfmodIgnoreChannels, type: 'textchannel' })
	@Column('varchar', { name: 'selfmod.ignored-channels', length: 19, array: true, default: () => 'ARRAY[]::VARCHAR[]' })
	public selfmodIgnoreChannels: string[] = [];

	@ConfigurableKey({ description: LanguageKeys.Settings.NoMentionSpamEnabled })
	@Column('boolean', { name: 'no-mention-spam.enabled', default: false })
	public noMentionSpamEnabled = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.NoMentionSpamAlerts })
	@Column('boolean', { name: 'no-mention-spam.alerts', default: false })
	public noMentionSpamAlerts = false;

	@ConfigurableKey({ description: LanguageKeys.Settings.NoMentionSpamMentionsAllowed, minimum: 0 })
	@Column('smallint', { name: 'no-mention-spam.mentions-allowed', default: 20 })
	public noMentionSpamMentionsAllowed = 20;

	@ConfigurableKey({ description: LanguageKeys.Settings.NoMentionSpamTimePeriod, minimum: 0 })
	@Column('integer', { name: 'no-mention-spam.time-period', default: 8 })
	public noMentionSpamTimePeriod = 8;

	/**
	 * The anti-spam adders used to control spam
	 */
	public readonly adders = new AdderManager(this);
	public readonly permissionNodes = new PermissionNodeManager(this);

	public wordFilterRegExp: RegExp | null = null;

	/**
	 * The ratelimit management for the no-mention-spam behavior
	 */
	public nms: RateLimitManager = null!;

	#words: readonly string[] = [];

	public get guild() {
		return container.client.guilds.cache.get(this.id)!;
	}

	/**
	 * Gets the [[Language]] for this entity.
	 */
	public getLanguage(): TFunction {
		return getT(this.language);
	}

	/**
	 * Gets the bare representation of the entity.
	 */
	public toJSON(): NonNullObject {
		return Object.fromEntries(configurableKeys.map((v) => [v.property, this[v.property] ?? v.default]));
	}

	public resetAll(): this {
		for (const value of configurableKeys.values()) {
			Reflect.set(this, value.property, value.default);
		}

		this.entityRemove();
		return this;
	}

	@AfterLoad()
	protected entityLoad() {
		this.adders.refresh();
		this.permissionNodes.refresh();
		this.nms = new RateLimitManager(this.noMentionSpamTimePeriod * 1000, this.noMentionSpamMentionsAllowed);
		this.wordFilterRegExp = this.selfmodFilterRaw.length ? new RegExp(create(this.selfmodFilterRaw), 'gi') : null;
		this.#words = this.selfmodFilterRaw.slice();
	}

	@AfterInsert()
	@AfterUpdate()
	protected entityUpdate() {
		this.adders.refresh();
		this.permissionNodes.onPatch();

		if (!arrayStrictEquals(this.#words, this.selfmodFilterRaw)) {
			this.#words = this.selfmodFilterRaw.slice();
			this.wordFilterRegExp = this.selfmodFilterRaw.length ? new RegExp(create(this.selfmodFilterRaw), 'gi') : null;
		}
	}

	@AfterRemove()
	protected entityRemove() {
		this.adders.onRemove();
		this.permissionNodes.onRemove();
		this.wordFilterRegExp = null;
		this.#words = [];
	}
}

export type GuildSettingsKeys = Exclude<keyof GuildEntity, keyof BaseEntity>;
export type GuildSettingsEntries = Pick<GuildEntity, GuildSettingsKeys>;
export type GuildSettingsOfType<T> = PickByValue<GuildSettingsEntries, T>;

export interface PermissionsNode {
	allow: string[];

	deny: string[];

	id: string;
}

export type CommandAutoDelete = readonly [string, number];

export interface DisabledCommandChannel {
	channel: string;

	commands: string[];
}

export interface StickyRole {
	roles: string[];

	user: string;
}

export interface ReactionRole {
	channel: string;

	emoji: SerializedEmoji;

	message: string | null;

	role: string;
}

export interface UniqueRoleSet {
	name: string;

	roles: readonly string[];
}
