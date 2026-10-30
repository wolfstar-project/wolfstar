import { SchemaGroup, type NonEmptyArray } from '#lib/database/settings/schema/SchemaGroup';
import { SchemaKey, type ConfigurableKeyValueOptions } from '#lib/database/settings/schema/SchemaKey';
import { JoinGuardMinimumTrustLimits, MaximumJoinGuardDirectMessageLength, type GuildDataKey } from 'wolfstar-database';
import type { TypedT } from '#lib/types';
import { objectEntries } from '@sapphire/utilities';
import { Collection } from '@discordjs/collection';

export type SchemaDataKey = Exclude<GuildDataKey, 'id'>;

const configurableKeys = new Collection<SchemaDataKey, SchemaKey>();
const configurableGroups = new SchemaGroup('::ROOT::');

export function getConfigurableKeys(): Collection<SchemaDataKey, SchemaKey> {
	getConfiguration();
	return configurableKeys;
}

export function getConfigurableGroups(): SchemaGroup {
	getConfiguration();
	return configurableGroups;
}

let cachedConfiguration: Record<SchemaDataKey, SchemaKey> | null = null;
export function getConfiguration() {
	cachedConfiguration ??= makeKeys({
		language: {
			type: 'language',
			description: 'settings:language',
			default: 'en-US'
		},
		timezone: {
			type: 'timezone',
			description: 'settings:timezone',
			default: 'UTC'
		},
		updatesChannel: { type: 'guildTextChannel', name: 'updates-channel', description: 'settings:updatesChannel' },

		// Modules
		modulesAutomod: { type: 'boolean', name: 'modules.automod', description: 'settings:modulesAutomod', default: true },
		modulesModeration: { type: 'boolean', name: 'modules.moderation', description: 'settings:modulesModeration', default: true },
		modulesLogs: { type: 'boolean', name: 'modules.logs', description: 'settings:modulesLogs', default: true },
		modulesRoles: { type: 'boolean', name: 'modules.roles', description: 'settings:modulesRoles', default: true },
		modulesAutodelete: { type: 'boolean', name: 'modules.autodelete', description: 'settings:modulesAutodelete', default: true },
		modulesAutopurge: { type: 'boolean', name: 'modules.autopurge', description: 'settings:modulesAutopurge', default: true },
		modulesAutomessage: { type: 'boolean', name: 'modules.automessage', description: 'settings:modulesAutomessage', default: true },
		modulesHoneypot: { type: 'boolean', name: 'modules.honeypot', description: 'settings:modulesHoneypot', default: true },

		// Auto-moderation
		automodChannel: { type: 'guildTextChannel', name: 'automod.channel', description: 'settings:automodChannel' },
		automodTrackNative: { type: 'boolean', name: 'automod.track-native', description: 'settings:automodTrackNative' },

		// Commands
		commandsDisabled: {
			type: 'commandMatch',
			name: 'commands.disabled',
			description: 'settings:disabledCommands',
			maximum: 32,
			array: true
		},
		commandsDisabledChannels: {
			type: 'guildTextChannel',
			name: 'commands.disabled-channels',
			description: 'settings:disabledChannels',
			array: true
		},
		// The channels and the roles each command is allowed in, or ignores, which the modal of `/commands` edits:
		commandsRestrictions: {
			type: 'notAllowed',
			name: 'commands.restrictions',
			description: 'settings:dashboardOnlyKey',
			array: true,
			dashboardOnly: true
		},

		// Honeypot
		honeypotChannel: { type: 'guildTextChannel', name: 'honeypot.channel', description: 'settings:honeypotChannel' },
		honeypotLogChannel: { type: 'guildTextChannel', name: 'honeypot.log-channel', description: 'settings:honeypotLogChannel' },
		honeypotAction: { type: 'honeypotAction', name: 'honeypot.action', description: 'settings:honeypotAction', default: 'Softban' },
		honeypotDirectMessage: {
			type: 'boolean',
			name: 'honeypot.direct-message',
			description: 'settings:honeypotDirectMessage',
			default: true
		},
		honeypotWarning: { type: 'boolean', name: 'honeypot.warning', description: 'settings:honeypotWarning', default: true },
		honeypotRandomName: { type: 'boolean', name: 'honeypot.random-name', description: 'settings:honeypotRandomName' },
		honeypotKeepActive: { type: 'boolean', name: 'honeypot.keep-active', description: 'settings:honeypotKeepActive' },

		// Join Guard. The rules are rows of their own, which the dashboard edits:
		joinGuardEnabled: { type: 'boolean', name: 'join-guard.enabled', description: 'settings:joinGuardEnabled' },
		joinGuardLogChannel: { type: 'guildTextChannel', name: 'join-guard.log-channel', description: 'settings:joinGuardLogChannel' },
		joinGuardDirectMessage: {
			type: 'boolean',
			name: 'join-guard.direct-message',
			description: 'settings:joinGuardDirectMessage',
			default: true
		},
		joinGuardDirectMessageContent: {
			type: 'string',
			name: 'join-guard.direct-message-content',
			description: 'settings:joinGuardDirectMessageContent',
			minimum: 1,
			maximum: MaximumJoinGuardDirectMessageLength
		},
		joinGuardCheckpoint: { type: 'boolean', name: 'join-guard.checkpoint', description: 'settings:joinGuardCheckpoint' },
		joinGuardPendingRole: { type: 'manageableRole', name: 'join-guard.pending-role', description: 'settings:joinGuardPendingRole' },
		joinGuardVerifiedRole: { type: 'manageableRole', name: 'join-guard.verified-role', description: 'settings:joinGuardVerifiedRole' },
		joinGuardCheckpointChannel: {
			type: 'guildTextChannel',
			name: 'join-guard.checkpoint-channel',
			description: 'settings:joinGuardCheckpointChannel'
		},
		// The message of the button the bot posted, which only the bot writes:
		joinGuardCheckpointMessage: {
			type: 'notAllowed',
			name: 'join-guard.checkpoint-message',
			description: 'settings:dashboardOnlyKey',
			dashboardOnly: true
		},
		joinGuardCheckpointTimeout: {
			type: 'joinGuardTimeout',
			name: 'join-guard.checkpoint-timeout',
			description: 'settings:joinGuardCheckpointTimeout',
			default: 86_400
		},
		joinGuardMinimumTrust: {
			type: 'integer',
			name: 'join-guard.minimum-trust',
			description: 'settings:joinGuardMinimumTrust',
			minimum: JoinGuardMinimumTrustLimits.minimum,
			maximum: JoinGuardMinimumTrustLimits.maximum,
			default: 1
		},
		joinGuardCaptcha: { type: 'boolean', name: 'join-guard.captcha', description: 'settings:joinGuardCaptcha', default: true },
		joinGuardConnections: { type: 'boolean', name: 'join-guard.connections', description: 'settings:joinGuardConnections', default: true },
		joinGuardSharedBans: { type: 'boolean', name: 'join-guard.shared-bans', description: 'settings:joinGuardSharedBans', default: true },
		joinGuardAllowedUsers: {
			type: 'user',
			name: 'join-guard.allowed-users',
			description: 'settings:joinGuardAllowedUsers',
			array: true
		},
		joinGuardAllowedRoles: { type: 'role', name: 'join-guard.allowed-roles', description: 'settings:joinGuardAllowedRoles', array: true },

		// Appeals
		appealsEnabled: { type: 'boolean', name: 'appeals.enabled', description: 'settings:appealsEnabled' },
		appealsChannel: { type: 'guildTextChannel', name: 'appeals.channel', description: 'settings:appealsChannel' },
		appealsBans: { type: 'boolean', name: 'appeals.bans', description: 'settings:appealsBans', default: true },
		appealsMutes: { type: 'boolean', name: 'appeals.mutes', description: 'settings:appealsMutes', default: true },
		appealsTimeouts: { type: 'boolean', name: 'appeals.timeouts', description: 'settings:appealsTimeouts', default: true },
		appealsQuestions: { type: 'string', name: 'appeals.questions', description: 'settings:appealsQuestions', array: true },

		// Logs
		logsMemberAdd: logChannel('member-add', 'settings:channelsLogsMemberAdd'),
		logsMemberRemove: logChannel('member-remove', 'settings:channelsLogsMemberRemove'),
		logsMemberNicknameUpdate: logChannel('member-nickname-update', 'settings:channelsLogsMemberNickNameUpdate'),
		logsMemberUsernameUpdate: logChannel('member-username-update', 'settings:channelsLogsMemberUserNameUpdate'),
		logsMessageDelete: logChannel('message-delete', 'settings:channelsLogsMessageDelete'),
		logsMessageDeleteNsfw: logChannel('message-delete-nsfw', 'settings:channelsLogsMessageDeleteNsfw'),
		logsMessageUpdate: logChannel('message-update', 'settings:channelsLogsMessageUpdate'),
		logsMessageUpdateNsfw: logChannel('message-update-nsfw', 'settings:channelsLogsMessageUpdateNsfw'),
		logsMessageUpdateStyle: {
			type: 'messageUpdateStyle',
			name: 'logs.message-update-style',
			description: 'settings:logsMessageUpdateStyle',
			default: 'Difference'
		},
		logsPrune: logChannel('prune', 'settings:channelsLogsPrune'),
		logsReactionEmojiAdd: logChannel('reaction-emoji-add', 'settings:channelsLogsReactionEmojiAdd'),
		logsReactionEmojiRemove: logChannel('reaction-emoji-remove', 'settings:channelsLogsReactionEmojiRemove'),
		logsReactionEmojiIncludeTwemoji: {
			type: 'boolean',
			name: 'logs.reaction-emoji-include-twemoji',
			description: 'settings:channelsLogsReactionEmojiIncludeTwemoji'
		},
		logsImage: logChannel('image', 'settings:channelsLogsImage'),
		logsRoleCreate: logChannel('role-create', 'settings:channelsLogsRoleCreate'),
		logsRoleUpdate: logChannel('role-update', 'settings:channelsLogsRoleUpdate'),
		logsRoleDelete: logChannel('role-delete', 'settings:channelsLogsRoleDelete'),
		logsChannelCreate: logChannel('channel-create', 'settings:channelsLogsChannelCreate'),
		logsChannelUpdate: logChannel('channel-update', 'settings:channelsLogsChannelUpdate'),
		logsChannelDelete: logChannel('channel-delete', 'settings:channelsLogsChannelDelete'),
		logsEmojiCreate: logChannel('emoji-create', 'settings:channelsLogsEmojiCreate'),
		logsEmojiUpdate: logChannel('emoji-update', 'settings:channelsLogsEmojiUpdate'),
		logsEmojiDelete: logChannel('emoji-delete', 'settings:channelsLogsEmojiDelete'),
		logsServerUpdate: logChannel('server-update', 'settings:channelsLogsServerUpdate'),
		logsInvites: logChannel('invites', 'settings:channelsLogsInvites'),
		logsThreads: logChannel('threads', 'settings:channelsLogsThreads'),
		logsEvents: logChannel('events', 'settings:channelsLogsEvents'),
		logsExpressions: logChannel('expressions', 'settings:channelsLogsExpressions'),
		logsIntegrations: logChannel('integrations', 'settings:channelsLogsIntegrations'),
		logsBoosts: logChannel('boosts', 'settings:channelsLogsBoosts'),
		logsIgnoreAll: {
			type: 'guildTextChannel',
			name: 'logs.ignore.all',
			description: 'settings:channelsIgnoreAll',
			array: true
		},
		logsIgnoreMessages: {
			type: 'guildTextChannel',
			name: 'logs.ignore.messages',
			description: 'settings:channelsIgnoreMessages',
			array: true
		},
		logsIgnoreReactions: {
			type: 'guildTextChannel',
			name: 'logs.ignore.reactions',
			description: 'settings:channelsIgnoreReactionAdd',
			array: true
		},
		logsWebhooks: { type: 'boolean', name: 'logs.webhooks', description: 'settings:logsWebhooks' },

		// Moderation
		moderationChannel: {
			type: 'guildTextChannel',
			name: 'moderation.channel',
			description: 'settings:channelsLogsModeration'
		},
		moderationTrackBans: {
			type: 'boolean',
			name: 'moderation.track-bans',
			description: 'settings:moderationTrackBans'
		},
		moderationTrackTimeouts: {
			type: 'boolean',
			name: 'moderation.track-timeouts',
			description: 'settings:moderationTrackTimeouts'
		},
		moderationTrackRoles: {
			type: 'boolean',
			name: 'moderation.track-roles',
			description: 'settings:moderationTrackRoles'
		},
		moderationTrackKicks: {
			type: 'boolean',
			name: 'moderation.track-kicks',
			description: 'settings:moderationTrackKicks'
		},
		moderationConfirmRecentMinutes: {
			type: 'integer',
			name: 'moderation.confirm-recent',
			description: 'settings:moderationConfirmRecentMinutes',
			minimum: 0,
			maximum: 60
		},
		moderationDehoist: {
			type: 'boolean',
			name: 'moderation.dehoist',
			description: 'settings:moderationDehoist'
		},

		// Permissions
		permissionsUsers: {
			type: 'permissionNode',
			name: 'permissions.users',
			description: 'settings:dashboardOnlyKey',
			array: true,
			dashboardOnly: true
		},
		permissionsRoles: {
			type: 'permissionNode',
			name: 'permissions.roles',
			description: 'settings:dashboardOnlyKey',
			array: true,
			dashboardOnly: true
		},

		// Reports
		reportsChannel: { type: 'guildTextChannel', name: 'reports.channel', description: 'settings:reportsChannel' },
		reportsRole: { type: 'role', name: 'reports.role', description: 'settings:reportsRole' },
		reportsAnonymous: { type: 'boolean', name: 'reports.anonymous', description: 'settings:reportsAnonymous' },
		reportsNotify: { type: 'boolean', name: 'reports.notify', description: 'settings:reportsNotify', default: true },
		reportsBlockedUsers: {
			type: 'user',
			name: 'reports.blocked-users',
			description: 'settings:dashboardOnlyKey',
			array: true,
			dashboardOnly: true
		},

		// Roles
		rolesInitial: { type: 'role', name: 'roles.initial', description: 'settings:rolesInitial', array: true },
		rolesInitialHumans: { type: 'role', name: 'roles.initial-humans', description: 'settings:rolesInitialHumans', array: true },
		rolesInitialRobots: { type: 'role', name: 'roles.initial-robots', description: 'settings:rolesInitialBots', array: true },
		rolesAdmin: { type: 'role', name: 'roles.admin', description: 'settings:rolesAdmin', array: true },
		rolesModerator: { type: 'role', name: 'roles.moderator', description: 'settings:rolesModerator', array: true },
		rolesMuted: { type: 'role', name: 'roles.muted', description: 'settings:rolesMuted' },
		rolesPublic: { type: 'role', name: 'roles.public', description: 'settings:rolesPublic', array: true },
		rolesRemoveInitial: { type: 'boolean', name: 'roles.remove-initial', description: 'settings:rolesRemoveInitial' },
		rolesUniqueRoleSets: {
			type: 'notAllowed',
			name: 'roles.unique-role-sets',
			description: 'settings:dashboardOnlyKey',
			array: true,
			dashboardOnly: true
		},
		rolesRestrictedReaction: {
			type: 'role',
			name: 'roles.restricted-reaction',
			description: 'settings:rolesRestrictedReaction'
		},
		rolesRestrictedEmbed: { type: 'role', name: 'roles.restricted-embed', description: 'settings:rolesRestrictedEmbed' },
		rolesRestrictedEmoji: { type: 'role', name: 'roles.restricted-emoji', description: 'settings:rolesRestrictedEmoji' },
		rolesRestrictedAttachment: {
			type: 'role',
			name: 'roles.restricted-attachment',
			description: 'settings:rolesRestrictedAttachment'
		},
		rolesRestrictedVoice: { type: 'role', name: 'roles.restricted-voice', description: 'settings:rolesRestrictedVoice' },
		stickyRoles: {
			type: 'notAllowed',
			name: 'sticky-roles',
			description: 'settings:dashboardOnlyKey',
			array: true,
			dashboardOnly: true
		}
	});

	return cachedConfiguration;
}

function logChannel(name: string, description: TypedT<string>): ConfigurableKeyOptions {
	return { type: 'guildLogChannel', name: `logs.${name}`, description };
}

function makeKeys(record: Record<SchemaDataKey, ConfigurableKeyOptions>): Record<SchemaDataKey, SchemaKey> {
	const entries = objectEntries(record).map(([key, value]) => [key, makeKey(key, value)] as const);
	return Object.fromEntries(entries) as Record<SchemaDataKey, SchemaKey>;
}

function makeKey(property: SchemaDataKey, options: ConfigurableKeyOptions) {
	const name = options.name ?? property;
	const parts = name.split('.') as NonEmptyArray<string>;

	const value = new SchemaKey({
		...options,
		key: parts.at(-1)!,
		name,
		property,
		array: options.array ?? false,
		inclusive: options.inclusive ?? true,
		minimum: options.minimum ?? null,
		maximum: options.maximum ?? null,
		default: options.default ?? (options.array ? [] : options.type === 'boolean' ? false : null),
		dashboardOnly: options.dashboardOnly ?? false
	});

	configurableKeys.set(property, value);
	value.parent = configurableGroups.add(value.name.split('.') as NonEmptyArray<string>, value);

	return value;
}

interface ConfigurableKeyOptions
	extends
		Omit<ConfigurableKeyValueOptions, 'key' | 'property' | 'name' | 'array' | 'inclusive' | 'minimum' | 'maximum' | 'default' | 'dashboardOnly'>,
		Partial<Pick<ConfigurableKeyValueOptions, 'name' | 'array' | 'inclusive' | 'minimum' | 'maximum' | 'default' | 'dashboardOnly'>> {}
