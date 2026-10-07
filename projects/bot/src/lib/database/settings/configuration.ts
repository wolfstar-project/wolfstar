import { SchemaGroup, type NonEmptyArray } from '#lib/database/settings/schema/SchemaGroup';
import { SchemaKey, type ConfigurableKeyValueOptions } from '#lib/database/settings/schema/SchemaKey';
import type { GuildDataKey } from 'wolfstar-database';
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
		...autoModerationRule('automodAttachments', 'automod.attachments', {
			enabled: 'settings:automodAttachmentsEnabled',
			ignoredRoles: 'settings:automodAttachmentsIgnoredRoles',
			ignoredChannels: 'settings:automodAttachmentsIgnoredChannels'
		}),
		...autoModerationRule('automodCapitals', 'automod.capitals', {
			enabled: 'settings:automodCapitalsEnabled',
			ignoredRoles: 'settings:automodCapitalsIgnoredRoles',
			ignoredChannels: 'settings:automodCapitalsIgnoredChannels'
		}),
		automodCapitalsMinimum: {
			type: 'integer',
			name: 'automod.capitals.minimum',
			description: 'settings:automodCapitalsMinimum',
			minimum: 5,
			maximum: 2000,
			default: 15
		},
		automodCapitalsMaximum: {
			type: 'integer',
			name: 'automod.capitals.maximum',
			description: 'settings:automodCapitalsMaximum',
			minimum: 10,
			maximum: 100,
			default: 50
		},
		...autoModerationRule('automodInvites', 'automod.invites', {
			enabled: 'settings:automodInvitesEnabled',
			ignoredRoles: 'settings:automodInvitesIgnoredRoles',
			ignoredChannels: 'settings:automodInvitesIgnoredChannels'
		}),
		automodInvitesAllowedCodes: {
			type: 'string',
			name: 'automod.invites.allowed-codes',
			description: 'settings:automodInvitesIgnoredCodes',
			array: true
		},
		automodInvitesAllowedGuilds: {
			type: 'snowflake',
			name: 'automod.invites.allowed-guilds',
			description: 'settings:automodInvitesIgnoredGuilds',
			array: true
		},
		...autoModerationRule('automodLinks', 'automod.links', {
			enabled: 'settings:automodLinksEnabled',
			ignoredRoles: 'settings:automodLinksIgnoredRoles',
			ignoredChannels: 'settings:automodLinksIgnoredChannels'
		}),
		automodLinksAllowed: {
			type: 'string',
			name: 'automod.links.allowed',
			description: 'settings:automodLinksAllowed',
			array: true
		},
		...autoModerationRule('automodMentions', 'automod.mentions', {
			enabled: 'settings:automodMentionsEnabled',
			ignoredRoles: 'settings:automodMentionsIgnoredRoles',
			ignoredChannels: 'settings:automodMentionsIgnoredChannels'
		}),
		automodMentionsOverrides: {
			type: 'notAllowed',
			name: 'automod.mentions.overrides',
			description: 'settings:dashboardOnlyKey',
			array: true,
			dashboardOnly: true
		},
		...autoModerationRule('automodNewlines', 'automod.newlines', {
			enabled: 'settings:automodNewlinesEnabled',
			ignoredRoles: 'settings:automodNewlinesIgnoredRoles',
			ignoredChannels: 'settings:automodNewlinesIgnoredChannels'
		}),
		automodNewlinesMaximum: {
			type: 'integer',
			name: 'automod.newlines.maximum',
			description: 'settings:automodNewlinesMaximum',
			minimum: 10,
			maximum: 100,
			default: 20
		},
		...autoModerationRule('automodNoMentionSpam', 'automod.no-mention-spam', {
			enabled: 'settings:automodNoMentionSpamEnabled',
			ignoredRoles: 'settings:automodNoMentionSpamIgnoredRoles',
			ignoredChannels: 'settings:automodNoMentionSpamIgnoredChannels'
		}),
		automodNoMentionSpamAlerts: {
			type: 'boolean',
			name: 'automod.no-mention-spam.alerts',
			description: 'settings:automodNoMentionSpamAlerts'
		},
		automodNoMentionSpamMentionsAllowed: {
			type: 'integer',
			name: 'automod.no-mention-spam.mentions-allowed',
			description: 'settings:automodNoMentionSpamMentionsAllowed',
			minimum: 0,
			default: 20
		},
		automodNoMentionSpamTimePeriod: {
			type: 'integer',
			name: 'automod.no-mention-spam.time-period',
			description: 'settings:automodNoMentionSpamTimePeriod',
			minimum: 0,
			default: 8
		},
		...autoModerationRule('automodWords', 'automod.words', {
			enabled: 'settings:automodFilterEnabled',
			ignoredRoles: 'settings:automodFilterIgnoredRoles',
			ignoredChannels: 'settings:automodFilterIgnoredChannels'
		}),
		automodWordsList: {
			type: 'string',
			name: 'automod.words.list',
			description: 'settings:dashboardOnlyKey',
			array: true,
			dashboardOnly: true
		},
		...autoModerationRule('automodZalgo', 'automod.zalgo', {
			enabled: 'settings:automodZalgoEnabled',
			ignoredRoles: 'settings:automodZalgoIgnoredRoles',
			ignoredChannels: 'settings:automodZalgoIgnoredChannels'
		}),
		automodZalgoMaximum: {
			type: 'integer',
			name: 'automod.zalgo.maximum',
			description: 'settings:automodZalgoMaximum',
			minimum: 1,
			maximum: 20,
			default: 4
		},

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
	| 'automodAttachments'
	| 'automodCapitals'
	| 'automodInvites'
	| 'automodLinks'
	| 'automodMentions'
	| 'automodNewlines'
	| 'automodWords'
	| 'automodZalgo'
	| 'automodNoMentionSpam';

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
