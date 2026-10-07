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

		// Logs
		logsMemberAdd: logChannel('member-add', 'settings:channelsLogsMemberAdd'),
		logsMemberRemove: logChannel('member-remove', 'settings:channelsLogsMemberRemove'),
		logsMemberNicknameUpdate: logChannel('member-nickname-update', 'settings:channelsLogsMemberNickNameUpdate'),
		logsMemberUsernameUpdate: logChannel('member-username-update', 'settings:channelsLogsMemberUserNameUpdate'),
		logsMessageDelete: logChannel('message-delete', 'settings:channelsLogsMessageDelete'),
		logsMessageDeleteNsfw: logChannel('message-delete-nsfw', 'settings:channelsLogsMessageDeleteNsfw'),
		logsMessageUpdate: logChannel('message-update', 'settings:channelsLogsMessageUpdate'),
		logsMessageUpdateNsfw: logChannel('message-update-nsfw', 'settings:channelsLogsMessageUpdateNsfw'),
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
		logsCommand: logChannel('command', 'settings:channelsLogsCommand'),
		logsSettings: logChannel('settings', 'settings:channelsLogsSettings'),
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
	return { type: 'guildTextChannel', name: `logs.${name}`, description };
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
