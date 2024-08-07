import type { ReadonlyGuildData } from '#lib/database/settings/types';
import { envParseString } from '@skyra/env-utilities';

let cachedDefaultGuildSettings: DefaultGuildData | null = null;

export function getDefaultGuildSettings() {
	cachedDefaultGuildSettings ??= Object.assign(Object.create(null), {
		prefix: envParseString('CLIENT_PREFIX'),
		language: 'en-US',
		disableNaturalPrefix: false,
		disabledCommands: [],
		permissionsUsers: [],
		permissionsRoles: [],
		channelsMediaOnly: [],
		channelsLogsModeration: null,
		channelsLogsImage: null,
		channelsLogsMemberAdd: null,
		channelsLogsMemberRemove: null,
		channelsLogsMemberNicknameUpdate: null,
		channelsLogsMemberUsernameUpdate: null,
		channelsLogsMemberRolesUpdate: null,
		channelsLogsMessageDelete: null,
		channelsLogsMessageDeleteNsfw: null,
		channelsLogsMessageUpdate: null,
		channelsLogsMessageUpdateNsfw: null,
		channelsLogsPrune: null,
		channelsLogsReaction: null,
		channelsLogsRoleCreate: null,
		channelsLogsRoleUpdate: null,
		channelsLogsRoleDelete: null,
		channelsLogsChannelCreate: null,
		channelsLogsChannelUpdate: null,
		channelsLogsChannelDelete: null,
		channelsLogsEmojiCreate: null,
		channelsLogsEmojiUpdate: null,
		channelsLogsEmojiDelete: null,
		channelsLogsServerUpdate: null,
		channelsLogsVoiceChannel: null,
		channelsIgnoreAll: [],
		channelsIgnoreMessageEdit: [],
		channelsIgnoreMessageDelete: [],
		channelsIgnoreReactionAdd: [],
		channelsIgnoreVoiceActivity: [],
		commandAutoDelete: [],
		disabledChannels: [],
		disabledCommandsChannels: [],
		eventsBanAdd: false,
		eventsBanRemove: false,
		eventsTimeout: false,
		eventsUnknownMessages: false,
		eventsTwemojiReactions: false,
		eventsIncludeBots: false,
		messagesIgnoreChannels: [],
		messagesModerationDm: false,
		messagesModerationReasonDisplay: true,
		messagesModerationMessageDisplay: true,
		messagesModerationAutoDelete: false,
		messagesModeratorNameDisplay: true,
		messagesAutoDeleteIgnoredAll: false,
		messagesAutoDeleteIgnoredRoles: [],
		messagesAutoDeleteIgnoredChannels: [],
		messagesAutoDeleteIgnoredCommands: [],
		stickyRoles: [],
		reactionRoles: [],
		rolesAdmin: [],
		rolesInitial: null,
		rolesInitialHumans: null,
		rolesInitialBots: null,
		rolesModerator: [],
		rolesMuted: null,
		rolesRestrictedReaction: null,
		rolesRestrictedEmbed: null,
		rolesRestrictedEmoji: null,
		rolesRestrictedAttachment: null,
		rolesRestrictedVoice: null,
		rolesPublic: [],
		rolesRemoveInitial: false,
		rolesUniqueRoleSets: [],
		selfmodAttachmentsEnabled: false,
		selfmodAttachmentsIgnoredRoles: [],
		selfmodAttachmentsIgnoredChannels: [],
		selfmodAttachmentsSoftAction: 0,
		selfmodAttachmentsHardAction: 0,
		selfmodAttachmentsHardActionDuration: null,
		selfmodAttachmentsThresholdMaximum: 10,
		selfmodAttachmentsThresholdDuration: 60000,
		selfmodCapitalsEnabled: false,
		selfmodCapitalsIgnoredRoles: [],
		selfmodCapitalsIgnoredChannels: [],
		selfmodCapitalsMinimum: 15,
		selfmodCapitalsMaximum: 50,
		selfmodCapitalsSoftAction: 0,
		selfmodCapitalsHardAction: 0,
		selfmodCapitalsHardActionDuration: null,
		selfmodCapitalsThresholdMaximum: 10,
		selfmodCapitalsThresholdDuration: 60000,
		selfmodLinksEnabled: false,
		selfmodLinksAllowed: [],
		selfmodLinksIgnoredRoles: [],
		selfmodLinksIgnoredChannels: [],
		selfmodLinksSoftAction: 0,
		selfmodLinksHardAction: 0,
		selfmodLinksHardActionDuration: null,
		selfmodLinksThresholdMaximum: 10,
		selfmodLinksThresholdDuration: 60000,
		selfmodMessagesEnabled: false,
		selfmodMessagesIgnoredRoles: [],
		selfmodMessagesIgnoredChannels: [],
		selfmodMessagesMaximum: 5,
		selfmodMessagesQueueSize: 50,
		selfmodMessagesSoftAction: 0,
		selfmodMessagesHardAction: 0,
		selfmodMessagesHardActionDuration: null,
		selfmodMessagesThresholdMaximum: 10,
		selfmodMessagesThresholdDuration: 60000,
		selfmodNewlinesEnabled: false,
		selfmodNewlinesIgnoredRoles: [],
		selfmodNewlinesIgnoredChannels: [],
		selfmodNewlinesMaximum: 20,
		selfmodNewlinesSoftAction: 0,
		selfmodNewlinesHardAction: 0,
		selfmodNewlinesHardActionDuration: null,
		selfmodNewlinesThresholdMaximum: 10,
		selfmodNewlinesThresholdDuration: 60000,
		selfmodInvitesEnabled: false,
		selfmodInvitesIgnoredCodes: [],
		selfmodInvitesIgnoredGuilds: [],
		selfmodInvitesIgnoredRoles: [],
		selfmodInvitesIgnoredChannels: [],
		selfmodInvitesSoftAction: 0,
		selfmodInvitesHardAction: 0,
		selfmodInvitesHardActionDuration: null,
		selfmodInvitesThresholdMaximum: 10,
		selfmodInvitesThresholdDuration: 60000,
		selfmodFilterEnabled: false,
		selfmodFilterRaw: [],
		selfmodFilterIgnoredRoles: [],
		selfmodFilterIgnoredChannels: [],
		selfmodFilterSoftAction: 0,
		selfmodFilterHardAction: 0,
		selfmodFilterHardActionDuration: null,
		selfmodFilterThresholdMaximum: 10,
		selfmodFilterThresholdDuration: 60000,
		selfmodReactionsEnabled: false,
		selfmodReactionsIgnoredRoles: [],
		selfmodReactionsIgnoredChannels: [],
		selfmodReactionsMaximum: 10,
		selfmodReactionsAllowed: [],
		selfmodReactionsBlocked: [],
		selfmodReactionsSoftAction: 0,
		selfmodReactionsHardAction: 0,
		selfmodReactionsHardActionDuration: null,
		selfmodReactionsThresholdMaximum: 10,
		selfmodReactionsThresholdDuration: 60000,
		selfmodIgnoredChannels: [],
		noMentionSpamEnabled: false,
		noMentionSpamAlerts: false,
		noMentionSpamMentionsAllowed: 20,
		noMentionSpamTimePeriod: 8
	} as const satisfies DefaultGuildData);

	return cachedDefaultGuildSettings;
}

export type DefaultGuildData = Omit<ReadonlyGuildData, 'id'>;
