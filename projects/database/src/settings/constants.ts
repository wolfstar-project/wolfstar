import type { ReadonlyGuildData } from './types.js';

let cachedDefaultGuildSettings: DefaultGuildData | null = null;

/**
 * The settings a guild has before anything is written for it. The values mirror the column defaults of the Prisma 8
 * contract; the columns without a default (the auto-moderation actions and thresholds) use the ones the bot ships with.
 */
export function getDefaultGuildSettings() {
	cachedDefaultGuildSettings ??= Object.assign(Object.create(null), {
		language: 'en-US',
		modulesAutomod: true,
		modulesModeration: true,
		modulesLogs: true,
		modulesCommands: true,
		modulesRoles: true,
		automodChannel: null,
		automodTrackNative: false,
		commandsDisabled: [],
		commandsDisabledChannels: [],
		logsMemberAdd: null,
		logsMemberRemove: null,
		logsMemberNicknameUpdate: null,
		logsMemberUsernameUpdate: null,
		logsMessageDelete: null,
		logsMessageDeleteNsfw: null,
		logsMessageUpdate: null,
		logsMessageUpdateNsfw: null,
		logsPrune: null,
		logsReactionEmojiAdd: null,
		logsReactionEmojiRemove: null,
		logsReactionEmojiIncludeTwemoji: false,
		logsImage: null,
		logsRoleCreate: null,
		logsRoleUpdate: null,
		logsRoleDelete: null,
		logsChannelCreate: null,
		logsChannelUpdate: null,
		logsChannelDelete: null,
		logsEmojiCreate: null,
		logsEmojiUpdate: null,
		logsEmojiDelete: null,
		logsServerUpdate: null,
		logsCommand: null,
		logsSettings: null,
		logsIgnoreAll: [],
		logsIgnoreMessages: [],
		logsIgnoreReactions: [],
		moderationChannel: null,
		moderationTrackBans: false,
		moderationTrackTimeouts: false,
		permissionsUsers: [],
		permissionsRoles: [],
		reportsChannel: null,
		reportsRole: null,
		reportsAnonymous: false,
		reportsNotify: true,
		reportsBlockedUsers: [],
		rolesInitial: [],
		rolesInitialHumans: [],
		rolesInitialRobots: [],
		rolesAdmin: [],
		rolesModerator: [],
		rolesMuted: null,
		rolesPublic: [],
		rolesRemoveInitial: false,
		rolesUniqueRoleSets: [],
		rolesRestrictedReaction: null,
		rolesRestrictedEmbed: null,
		rolesRestrictedEmoji: null,
		rolesRestrictedAttachment: null,
		rolesRestrictedVoice: null,
		stickyRoles: []
	} as const satisfies DefaultGuildData);

	return cachedDefaultGuildSettings;
}

export type DefaultGuildData = Omit<ReadonlyGuildData, 'id'>;
