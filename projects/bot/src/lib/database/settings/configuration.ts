import { SchemaGroup, type NonEmptyArray } from '#lib/database/settings/schema/SchemaGroup';
import { SchemaKey, type ConfigurableKeyValueOptions } from '#lib/database/settings/schema/SchemaKey';
import type { GuildDataKey } from '#lib/database/settings/types';
import { LanguageKeys } from '#lib/i18n/languageKeys';
import type { TypedT } from '#lib/types';
import { objectEntries } from '@sapphire/utilities';
import { Collection } from 'discord.js';

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
			description: LanguageKeys.Settings.Language,
			default: 'en-US'
		},

		// Modules
		modulesAutomod: { type: 'boolean', name: 'modules.automod', description: LanguageKeys.Settings.ModulesAutomod, default: true },
		modulesModeration: { type: 'boolean', name: 'modules.moderation', description: LanguageKeys.Settings.ModulesModeration, default: true },
		modulesLogs: { type: 'boolean', name: 'modules.logs', description: LanguageKeys.Settings.ModulesLogs, default: true },
		modulesCommands: { type: 'boolean', name: 'modules.commands', description: LanguageKeys.Settings.ModulesCommands, default: true },
		modulesRoles: { type: 'boolean', name: 'modules.roles', description: LanguageKeys.Settings.ModulesRoles, default: true },

		// Auto-moderation
		automodChannel: { type: 'guildTextChannel', name: 'automod.channel', description: LanguageKeys.Settings.AutomodChannel },
		automodTrackNative: { type: 'boolean', name: 'automod.track-native', description: LanguageKeys.Settings.AutomodTrackNative },
		...autoModerationRule('selfmodAttachments', 'selfmod.attachments', {
			enabled: LanguageKeys.Settings.SelfmodAttachmentsEnabled,
			ignoredRoles: LanguageKeys.Settings.SelfmodAttachmentsIgnoredRoles,
			ignoredChannels: LanguageKeys.Settings.SelfmodAttachmentsIgnoredChannels
		}),
		...autoModerationRule('selfmodCapitals', 'selfmod.capitals', {
			enabled: LanguageKeys.Settings.SelfmodCapitalsEnabled,
			ignoredRoles: LanguageKeys.Settings.SelfmodCapitalsIgnoredRoles,
			ignoredChannels: LanguageKeys.Settings.SelfmodCapitalsIgnoredChannels
		}),
		selfmodCapitalsMinimum: {
			type: 'integer',
			name: 'selfmod.capitals.minimum',
			description: LanguageKeys.Settings.SelfmodCapitalsMinimum,
			minimum: 5,
			maximum: 2000,
			default: 15
		},
		selfmodCapitalsMaximum: {
			type: 'integer',
			name: 'selfmod.capitals.maximum',
			description: LanguageKeys.Settings.SelfmodCapitalsMaximum,
			minimum: 10,
			maximum: 100,
			default: 50
		},
		...autoModerationRule('selfmodInvites', 'selfmod.invites', {
			enabled: LanguageKeys.Settings.SelfmodInvitesEnabled,
			ignoredRoles: LanguageKeys.Settings.SelfmodInvitesIgnoredRoles,
			ignoredChannels: LanguageKeys.Settings.SelfmodInvitesIgnoredChannels
		}),
		selfmodInvitesAllowedCodes: {
			type: 'string',
			name: 'selfmod.invites.allowed-codes',
			description: LanguageKeys.Settings.SelfmodInvitesIgnoredCodes,
			array: true
		},
		selfmodInvitesAllowedGuilds: {
			type: 'snowflake',
			name: 'selfmod.invites.allowed-guilds',
			description: LanguageKeys.Settings.SelfmodInvitesIgnoredGuilds,
			array: true
		},
		...autoModerationRule('selfmodLinks', 'selfmod.links', {
			enabled: LanguageKeys.Settings.SelfmodLinksEnabled,
			ignoredRoles: LanguageKeys.Settings.SelfmodLinksIgnoredRoles,
			ignoredChannels: LanguageKeys.Settings.SelfmodLinksIgnoredChannels
		}),
		selfmodLinksAllowed: {
			type: 'string',
			name: 'selfmod.links.allowed',
			description: LanguageKeys.Settings.SelfmodLinksAllowed,
			array: true
		},
		...autoModerationRule('selfmodMentions', 'selfmod.mentions', {
			enabled: LanguageKeys.Settings.SelfmodMentionsEnabled,
			ignoredRoles: LanguageKeys.Settings.SelfmodMentionsIgnoredRoles,
			ignoredChannels: LanguageKeys.Settings.SelfmodMentionsIgnoredChannels
		}),
		selfmodMentionsOverrides: {
			type: 'notAllowed',
			name: 'selfmod.mentions.overrides',
			description: LanguageKeys.Settings.DashboardOnlyKey,
			array: true,
			dashboardOnly: true
		},
		...autoModerationRule('selfmodNewlines', 'selfmod.newlines', {
			enabled: LanguageKeys.Settings.SelfmodNewlinesEnabled,
			ignoredRoles: LanguageKeys.Settings.SelfmodNewlinesIgnoredRoles,
			ignoredChannels: LanguageKeys.Settings.SelfmodNewlinesIgnoredChannels
		}),
		selfmodNewlinesMaximum: {
			type: 'integer',
			name: 'selfmod.newlines.maximum',
			description: LanguageKeys.Settings.SelfmodNewlinesMaximum,
			minimum: 10,
			maximum: 100,
			default: 20
		},
		...autoModerationRule('noMentionSpam', 'no-mention-spam', {
			enabled: LanguageKeys.Settings.NoMentionSpamEnabled,
			ignoredRoles: LanguageKeys.Settings.NoMentionSpamIgnoredRoles,
			ignoredChannels: LanguageKeys.Settings.NoMentionSpamIgnoredChannels
		}),
		noMentionSpamAlerts: {
			type: 'boolean',
			name: 'no-mention-spam.alerts',
			description: LanguageKeys.Settings.NoMentionSpamAlerts
		},
		noMentionSpamMentionsAllowed: {
			type: 'integer',
			name: 'no-mention-spam.mentions-allowed',
			description: LanguageKeys.Settings.NoMentionSpamMentionsAllowed,
			minimum: 0,
			default: 20
		},
		noMentionSpamTimePeriod: {
			type: 'integer',
			name: 'no-mention-spam.time-period',
			description: LanguageKeys.Settings.NoMentionSpamTimePeriod,
			minimum: 0,
			default: 8
		},
		...autoModerationRule('selfmodWords', 'selfmod.words', {
			enabled: LanguageKeys.Settings.SelfmodFilterEnabled,
			ignoredRoles: LanguageKeys.Settings.SelfmodFilterIgnoredRoles,
			ignoredChannels: LanguageKeys.Settings.SelfmodFilterIgnoredChannels
		}),
		selfmodWordsList: {
			type: 'string',
			name: 'selfmod.words.list',
			description: LanguageKeys.Settings.DashboardOnlyKey,
			array: true,
			dashboardOnly: true
		},

		// Commands
		commandsDisabled: {
			// @ts-expect-error Serializer 'commandmatch' exists but is not camel cased.
			type: 'commandmatch',
			name: 'commands.disabled',
			description: LanguageKeys.Settings.DisabledCommands,
			maximum: 32,
			array: true
		},
		commandsDisabledChannels: {
			type: 'guildTextChannel',
			name: 'commands.disabled-channels',
			description: LanguageKeys.Settings.DisabledChannels,
			array: true
		},
		commandsDisabledInChannels: {
			type: 'notAllowed',
			name: 'commands.disabled-in-channels',
			description: LanguageKeys.Settings.DashboardOnlyKey,
			array: true,
			dashboardOnly: true
		},

		// Logs
		logsMemberAdd: logChannel('member-add', LanguageKeys.Settings.Channels.Logs.MemberAdd),
		logsMemberRemove: logChannel('member-remove', LanguageKeys.Settings.Channels.Logs.MemberRemove),
		logsMemberNicknameUpdate: logChannel('member-nickname-update', LanguageKeys.Settings.Channels.Logs.MemberNickNameUpdate),
		logsMemberUsernameUpdate: logChannel('member-username-update', LanguageKeys.Settings.Channels.Logs.MemberUserNameUpdate),
		logsMessageDelete: logChannel('message-delete', LanguageKeys.Settings.Channels.Logs.MessageDelete),
		logsMessageDeleteNsfw: logChannel('message-delete-nsfw', LanguageKeys.Settings.Channels.Logs.MessageDeleteNsfw),
		logsMessageUpdate: logChannel('message-update', LanguageKeys.Settings.Channels.Logs.MessageUpdate),
		logsMessageUpdateNsfw: logChannel('message-update-nsfw', LanguageKeys.Settings.Channels.Logs.MessageUpdateNsfw),
		logsPrune: logChannel('prune', LanguageKeys.Settings.Channels.Logs.Prune),
		logsReaction: logChannel('reaction', LanguageKeys.Settings.Channels.Logs.Reaction),
		logsRoleCreate: logChannel('role-create', LanguageKeys.Settings.Channels.Logs.RoleCreate),
		logsRoleUpdate: logChannel('role-update', LanguageKeys.Settings.Channels.Logs.RoleUpdate),
		logsRoleDelete: logChannel('role-delete', LanguageKeys.Settings.Channels.Logs.RoleDelete),
		logsChannelCreate: logChannel('channel-create', LanguageKeys.Settings.Channels.Logs.ChannelCreate),
		logsChannelUpdate: logChannel('channel-update', LanguageKeys.Settings.Channels.Logs.ChannelUpdate),
		logsChannelDelete: logChannel('channel-delete', LanguageKeys.Settings.Channels.Logs.ChannelDelete),
		logsEmojiCreate: logChannel('emoji-create', LanguageKeys.Settings.Channels.Logs.EmojiCreate),
		logsEmojiUpdate: logChannel('emoji-update', LanguageKeys.Settings.Channels.Logs.EmojiUpdate),
		logsEmojiDelete: logChannel('emoji-delete', LanguageKeys.Settings.Channels.Logs.EmojiDelete),
		logsEmojiAdd: logChannel('emoji-add', LanguageKeys.Settings.Channels.Logs.EmojiAdd),
		logsEmojiAddIncludeTwemoji: {
			type: 'boolean',
			name: 'logs.emoji-add-include-twemoji',
			description: LanguageKeys.Settings.Channels.Logs.EmojiAddIncludeTwemoji
		},
		logsServerUpdate: logChannel('server-update', LanguageKeys.Settings.Channels.Logs.ServerUpdate),
		logsCommand: logChannel('command', LanguageKeys.Settings.Channels.Logs.Command),
		logsSettings: logChannel('settings', LanguageKeys.Settings.Channels.Logs.Settings),
		logsIgnoreAll: {
			type: 'guildTextChannel',
			name: 'logs.ignore.all',
			description: LanguageKeys.Settings.Channels.Ignore.All,
			array: true
		},
		logsIgnoreMessages: {
			type: 'guildTextChannel',
			name: 'logs.ignore.messages',
			description: LanguageKeys.Settings.Channels.Ignore.Messages,
			array: true
		},
		logsIgnoreReactions: {
			type: 'guildTextChannel',
			name: 'logs.ignore.reactions',
			description: LanguageKeys.Settings.Channels.Ignore.ReactionAdd,
			array: true
		},

		// Moderation
		moderationChannel: {
			type: 'guildTextChannel',
			name: 'moderation.channel',
			description: LanguageKeys.Settings.Channels.Logs.Moderation
		},
		moderationTrackBans: {
			type: 'boolean',
			name: 'moderation.track-bans',
			description: LanguageKeys.Settings.ModerationTrackBans
		},
		moderationTrackTimeouts: {
			type: 'boolean',
			name: 'moderation.track-timeouts',
			description: LanguageKeys.Settings.ModerationTrackTimeouts
		},

		// Permissions
		permissionsUsers: {
			type: 'permissionNode',
			name: 'permissions.users',
			description: LanguageKeys.Settings.DashboardOnlyKey,
			array: true,
			dashboardOnly: true
		},
		permissionsRoles: {
			type: 'permissionNode',
			name: 'permissions.roles',
			description: LanguageKeys.Settings.DashboardOnlyKey,
			array: true,
			dashboardOnly: true
		},

		// Roles
		rolesInitial: { type: 'role', name: 'roles.initial', description: LanguageKeys.Settings.RolesInitial, array: true },
		rolesInitialHumans: { type: 'role', name: 'roles.initial-humans', description: LanguageKeys.Settings.RolesInitialHumans, array: true },
		rolesInitialRobots: { type: 'role', name: 'roles.initial-robots', description: LanguageKeys.Settings.RolesInitialBots, array: true },
		rolesAdmin: { type: 'role', name: 'roles.admin', description: LanguageKeys.Settings.RolesAdmin, array: true },
		rolesModerator: { type: 'role', name: 'roles.moderator', description: LanguageKeys.Settings.RolesModerator, array: true },
		rolesMuted: { type: 'role', name: 'roles.muted', description: LanguageKeys.Settings.RolesMuted },
		rolesPublic: { type: 'role', name: 'roles.public', description: LanguageKeys.Settings.RolesPublic, array: true },
		rolesRemoveInitial: { type: 'boolean', name: 'roles.remove-initial', description: LanguageKeys.Settings.RolesRemoveInitial },
		rolesUniqueRoleSets: {
			type: 'notAllowed',
			name: 'roles.unique-role-sets',
			description: LanguageKeys.Settings.DashboardOnlyKey,
			array: true,
			dashboardOnly: true
		},
		rolesRestrictedReaction: {
			type: 'role',
			name: 'roles.restricted-reaction',
			description: LanguageKeys.Settings.RolesRestrictedReaction
		},
		rolesRestrictedEmbed: { type: 'role', name: 'roles.restricted-embed', description: LanguageKeys.Settings.RolesRestrictedEmbed },
		rolesRestrictedEmoji: { type: 'role', name: 'roles.restricted-emoji', description: LanguageKeys.Settings.RolesRestrictedEmoji },
		rolesRestrictedAttachment: {
			type: 'role',
			name: 'roles.restricted-attachment',
			description: LanguageKeys.Settings.RolesRestrictedAttachment
		},
		rolesRestrictedVoice: { type: 'role', name: 'roles.restricted-voice', description: LanguageKeys.Settings.RolesRestrictedVoice }
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
	const dashboardOnly = { description: LanguageKeys.Settings.DashboardOnlyKey, dashboardOnly: true } as const;
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
