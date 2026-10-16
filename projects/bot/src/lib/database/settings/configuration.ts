import { SchemaGroup, type NonEmptyArray } from '#lib/database/settings/schema/SchemaGroup';
import { SchemaKey, type ConfigurableKeyValueOptions } from '#lib/database/settings/schema/SchemaKey';
import type { GuildDataKey } from 'wolfstar-database';
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
		modulesCommands: { type: 'boolean', name: 'modules.commands', description: 'settings:modulesCommands', default: true },
		modulesRoles: { type: 'boolean', name: 'modules.roles', description: 'settings:modulesRoles', default: true },

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

		// Appeals
		appealsEnabled: { type: 'boolean', name: 'appeals.enabled', description: 'settings:appealsEnabled' },
		appealsChannel: { type: 'guildTextChannel', name: 'appeals.channel', description: 'settings:appealsChannel' },
		appealsBans: { type: 'boolean', name: 'appeals.bans', description: 'settings:appealsBans', default: true },
		appealsMutes: { type: 'boolean', name: 'appeals.mutes', description: 'settings:appealsMutes', default: true },
		appealsTimeouts: { type: 'boolean', name: 'appeals.timeouts', description: 'settings:appealsTimeouts', default: true },
		appealsQuestions: { type: 'string', name: 'appeals.questions', description: 'settings:appealsQuestions', array: true },

		// Greetings
		greetingsJoinChannel: { type: 'guildTextChannel', name: 'greetings.join-channel', description: 'settings:greetingsJoinChannel' },
		greetingsJoinMessages: { type: 'string', name: 'greetings.join-messages', description: 'settings:greetingsJoinMessages', array: true },
		greetingsJoinDirect: { type: 'boolean', name: 'greetings.join-direct', description: 'settings:greetingsJoinDirect' },
		greetingsLeaveChannel: { type: 'guildTextChannel', name: 'greetings.leave-channel', description: 'settings:greetingsLeaveChannel' },
		greetingsLeaveMessages: { type: 'string', name: 'greetings.leave-messages', description: 'settings:greetingsLeaveMessages', array: true },

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
