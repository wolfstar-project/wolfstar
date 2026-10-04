import { SchemaGroup, type NonEmptyArray } from '#lib/database/settings/schema/SchemaGroup';
import { SchemaKey, type ConfigurableKeyValueOptions } from '#lib/database/settings/schema/SchemaKey';
import type { GuildDataKey } from '#lib/database/settings/types';
import type { TypedT } from '#lib/types';
import { objectEntries } from '@sapphire/utilities';
import { Collection } from '@discordjs/collection';

export type SchemaDataKey = Exclude<GuildDataKey, 'id'>;

/**
 * The largest duration the `Int` (int4) duration columns hold, in milliseconds: about 24.8 days.
 */
const MaximumDuration = 2 ** 31 - 1;

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
		...autoModerationRule('selfmodAttachments', 'selfmod.attachments', {
			enabled: 'settings:selfmodAttachmentsEnabled',
			ignoredRoles: 'settings:selfmodAttachmentsIgnoredRoles',
			ignoredChannels: 'settings:selfmodAttachmentsIgnoredChannels'
		}),
		...autoModerationRule('selfmodCapitals', 'selfmod.capitals', {
			enabled: 'settings:selfmodCapitalsEnabled',
			ignoredRoles: 'settings:selfmodCapitalsIgnoredRoles',
			ignoredChannels: 'settings:selfmodCapitalsIgnoredChannels'
		}),
		selfmodCapitalsMinimum: {
			type: 'integer',
			name: 'selfmod.capitals.minimum',
			description: 'settings:selfmodCapitalsMinimum',
			minimum: 5,
			maximum: 2000,
			default: 15
		},
		selfmodCapitalsMaximum: {
			type: 'integer',
			name: 'selfmod.capitals.maximum',
			description: 'settings:selfmodCapitalsMaximum',
			minimum: 10,
			maximum: 100,
			default: 50
		},
		...autoModerationRule('selfmodInvites', 'selfmod.invites', {
			enabled: 'settings:selfmodInvitesEnabled',
			ignoredRoles: 'settings:selfmodInvitesIgnoredRoles',
			ignoredChannels: 'settings:selfmodInvitesIgnoredChannels'
		}),
		selfmodInvitesAllowedCodes: {
			type: 'string',
			name: 'selfmod.invites.allowed-codes',
			description: 'settings:selfmodInvitesIgnoredCodes',
			array: true
		},
		selfmodInvitesAllowedGuilds: {
			type: 'snowflake',
			name: 'selfmod.invites.allowed-guilds',
			description: 'settings:selfmodInvitesIgnoredGuilds',
			array: true
		},
		...autoModerationRule('selfmodLinks', 'selfmod.links', {
			enabled: 'settings:selfmodLinksEnabled',
			ignoredRoles: 'settings:selfmodLinksIgnoredRoles',
			ignoredChannels: 'settings:selfmodLinksIgnoredChannels'
		}),
		selfmodLinksAllowed: {
			type: 'string',
			name: 'selfmod.links.allowed',
			description: 'settings:selfmodLinksAllowed',
			array: true
		},
		...autoModerationRule('selfmodMentions', 'selfmod.mentions', {
			enabled: 'settings:selfmodMentionsEnabled',
			ignoredRoles: 'settings:selfmodMentionsIgnoredRoles',
			ignoredChannels: 'settings:selfmodMentionsIgnoredChannels'
		}),
		selfmodMentionsOverrides: {
			type: 'notAllowed',
			name: 'selfmod.mentions.overrides',
			description: 'settings:dashboardOnlyKey',
			array: true,
			dashboardOnly: true
		},
		...autoModerationRule('selfmodNewlines', 'selfmod.newlines', {
			enabled: 'settings:selfmodNewlinesEnabled',
			ignoredRoles: 'settings:selfmodNewlinesIgnoredRoles',
			ignoredChannels: 'settings:selfmodNewlinesIgnoredChannels'
		}),
		selfmodNewlinesMaximum: {
			type: 'integer',
			name: 'selfmod.newlines.maximum',
			description: 'settings:selfmodNewlinesMaximum',
			minimum: 10,
			maximum: 100,
			default: 20
		},
		...autoModerationRule('noMentionSpam', 'no-mention-spam', {
			enabled: 'settings:noMentionSpamEnabled',
			ignoredRoles: 'settings:noMentionSpamIgnoredRoles',
			ignoredChannels: 'settings:noMentionSpamIgnoredChannels'
		}),
		noMentionSpamAlerts: {
			type: 'boolean',
			name: 'no-mention-spam.alerts',
			description: 'settings:noMentionSpamAlerts'
		},
		noMentionSpamMentionsAllowed: {
			type: 'integer',
			name: 'no-mention-spam.mentions-allowed',
			description: 'settings:noMentionSpamMentionsAllowed',
			minimum: 0,
			default: 20
		},
		noMentionSpamTimePeriod: {
			type: 'integer',
			name: 'no-mention-spam.time-period',
			description: 'settings:noMentionSpamTimePeriod',
			minimum: 0,
			default: 8
		},
		...autoModerationRule('selfmodWords', 'selfmod.words', {
			enabled: 'settings:selfmodFilterEnabled',
			ignoredRoles: 'settings:selfmodFilterIgnoredRoles',
			ignoredChannels: 'settings:selfmodFilterIgnoredChannels'
		}),
		selfmodWordsList: {
			type: 'string',
			name: 'selfmod.words.list',
			description: 'settings:dashboardOnlyKey',
			array: true,
			dashboardOnly: true
		},

		// Commands
		commandsDisabled: {
			// @ts-expect-error Serializer 'commandmatch' exists but is not camel cased.
			type: 'commandmatch',
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
		logsReaction: logChannel('reaction', 'settings:channelsLogsReaction'),
		logsRoleCreate: logChannel('role-create', 'settings:channelsLogsRoleCreate'),
		logsRoleUpdate: logChannel('role-update', 'settings:channelsLogsRoleUpdate'),
		logsRoleDelete: logChannel('role-delete', 'settings:channelsLogsRoleDelete'),
		logsChannelCreate: logChannel('channel-create', 'settings:channelsLogsChannelCreate'),
		logsChannelUpdate: logChannel('channel-update', 'settings:channelsLogsChannelUpdate'),
		logsChannelDelete: logChannel('channel-delete', 'settings:channelsLogsChannelDelete'),
		logsEmojiCreate: logChannel('emoji-create', 'settings:channelsLogsEmojiCreate'),
		logsEmojiUpdate: logChannel('emoji-update', 'settings:channelsLogsEmojiUpdate'),
		logsEmojiDelete: logChannel('emoji-delete', 'settings:channelsLogsEmojiDelete'),
		logsEmojiAdd: logChannel('emoji-add', 'settings:channelsLogsEmojiAdd'),
		logsEmojiAddIncludeTwemoji: {
			type: 'boolean',
			name: 'logs.emoji-add-include-twemoji',
			description: 'settings:channelsLogsEmojiAddIncludeTwemoji'
		},
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

type AutoModerationRulePrefix =
	| 'selfmodAttachments'
	| 'selfmodCapitals'
	| 'selfmodInvites'
	| 'selfmodLinks'
	| 'selfmodMentions'
	| 'selfmodNewlines'
	| 'selfmodWords'
	| 'noMentionSpam';

type AutoModerationRuleSuffix =
	| 'Enabled'
	| 'SoftAction'
	| 'HardAction'
	| 'HardActionDuration'
	| 'ThresholdMaximum'
	| 'ThresholdDuration'
	| 'IgnoredRoles'
	| 'IgnoredChannels';

interface AutoModerationRuleDescriptions {
	enabled: TypedT<string>;
	ignoredRoles: TypedT<string>;
	ignoredChannels: TypedT<string>;
}

/**
 * The keys every `GuildAutoModeration*` table shares. The actions and thresholds are configured on the dashboard.
 */
function autoModerationRule<const P extends AutoModerationRulePrefix>(
	prefix: P,
	name: string,
	descriptions: AutoModerationRuleDescriptions
): Record<`${P}${AutoModerationRuleSuffix}`, ConfigurableKeyOptions> {
	const dashboardOnly = { description: 'settings:dashboardOnlyKey', dashboardOnly: true } as const;
	return {
		[`${prefix}Enabled`]: { type: 'boolean', name: `${name}.enabled`, description: descriptions.enabled, default: false },
		[`${prefix}IgnoredRoles`]: { type: 'role', name: `${name}.ignored-roles`, description: descriptions.ignoredRoles, array: true },
		[`${prefix}IgnoredChannels`]: {
			type: 'guildTextChannel',
			name: `${name}.ignored-channels`,
			description: descriptions.ignoredChannels,
			array: true
		},
		[`${prefix}SoftAction`]: { type: 'integer', name: `${name}.soft-action`, default: 0, ...dashboardOnly },
		[`${prefix}HardAction`]: { type: 'string', name: `${name}.hard-action`, default: 'Warning', ...dashboardOnly },
		[`${prefix}HardActionDuration`]: {
			type: 'timespan',
			name: `${name}.hard-action-duration`,
			minimum: 0,
			maximum: MaximumDuration,
			...dashboardOnly
		},
		[`${prefix}ThresholdMaximum`]: {
			type: 'integer',
			name: `${name}.threshold-maximum`,
			minimum: 0,
			maximum: 100,
			default: 10,
			...dashboardOnly
		},
		[`${prefix}ThresholdDuration`]: {
			type: 'timespan',
			name: `${name}.threshold-duration`,
			minimum: 0,
			maximum: MaximumDuration,
			default: 60000,
			...dashboardOnly
		}
	} as Record<`${P}${AutoModerationRuleSuffix}`, ConfigurableKeyOptions>;
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
