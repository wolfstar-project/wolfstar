export const enum Events {
	AnalyticsSync = 'analyticsSync',
	Error = 'error',
	PreMessageParsed = 'preMessageParsed',
	ArgumentError = 'argumentError',
	CommandUsageAnalytics = 'commandUsageAnalytics',
	CoreSettingsDelete = 'coreSettingsDelete',
	CoreSettingsUpdate = 'coreSettingsUpdate',
	Disconnect = 'disconnect',
	EventError = 'eventError',
	GuildBanAdd = 'guildBanAdd',
	GuildBanRemove = 'guildBanRemove',
	GuildCreate = 'guildCreate',
	GuildDelete = 'guildDelete',
	GuildMemberUpdate = 'guildMemberUpdate',
	GuildMessageDelete = 'guildMessageDelete',
	GuildMessageLog = 'guildMessageLog',
	GuildMessageUpdate = 'guildMessageUpdate',
	GuildUserMessage = 'guildUserMessage',
	GuildUserMessageSocialPointsAddUser = 'guildUserMessageSocialPointsAddUser',
	GuildUserMessageSocialPointsAddMember = 'guildUserMessageSocialPointsAddMember',
	GuildUserMessageSocialPointsAddMemberReward = 'guildUserMessageSocialPointsAddMemberReward',
	MentionSpamExceeded = 'mentionSpamExceeded',
	MentionSpamWarning = 'mentionSpamWarning',
	MessageCreate = 'messageCreate',
	MessageDelete = 'messageDelete',
	MessageDeleteBulk = 'messageDeleteBulk',
	MessageUpdate = 'messageUpdate',
	ModerationEntryAdd = 'moderationEntryAdd',
	ModerationEntryEdit = 'moderationEntryEdit',
	NotMutedMemberAdd = 'notMutedMemberAdd',
	Raw = 'raw',
	RawMemberAdd = 'rawMemberAdd',
	RawMemberRemove = 'rawMemberRemove',
	RawMessageCreate = 'rawMessageCreate',
	RawReactionAdd = 'rawReactionAdd',
	RawReactionRemove = 'rawReactionRemove',
	ReactionBlocked = 'reactionBlocked',
	Reconnecting = 'reconnecting',
	ResourceAnalyticsSync = 'resourceAnalyticsSync',
	SettingsUpdate = 'settingsUpdate',
	TaskError = 'taskError',
	UnhandledRejection = 'unhandledRejection',
	UserMessage = 'userMessage'
}

export const enum PermissionLevels {
	Everyone = 0,
	Moderator = 5,
	Administrator = 6,
	ServerOwner = 7,
	BotOwner = 10
}

export const enum Schedules {
	Poststats = 'poststats',
	SyncResourceAnalytics = 'syncResourceAnalytics',
	Reminder = 'reminder'
}
