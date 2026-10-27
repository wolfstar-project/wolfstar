import { ChannelType } from 'discord-api-types/v10';

/** The top-level text channels supported by settings, automatic messages and cleanup. */
export const GuildTextChannelTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

/** Channels whose own ID can be the channel of a guild message, including voice and stage chats. */
export const GuildMessageChannelTypes = [
	...GuildTextChannelTypes,
	ChannelType.GuildVoice,
	ChannelType.GuildStageVoice,
	ChannelType.PublicThread,
	ChannelType.PrivateThread,
	ChannelType.AnnouncementThread
] as const;
