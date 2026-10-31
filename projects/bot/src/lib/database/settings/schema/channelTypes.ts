import type { SchemaKeyType } from './SchemaKey';
import { GuildTextChannelTypes } from '#utils/channelTypes';
import { ChannelType } from 'discord-api-types/v10';

/** The same channel types are offered by the settings menu and accepted by its serializer. */
export function getSchemaChannelTypes(type: SchemaKeyType): ChannelType[] {
	switch (type) {
		case 'guildTextChannel':
			return [...GuildTextChannelTypes];
		case 'guildLogChannel':
			return [...GuildTextChannelTypes, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread];
		case 'guildVoiceChannel':
			return [ChannelType.GuildVoice];
		case 'guildCategoryChannel':
			return [ChannelType.GuildCategory];
		case 'categoryOrTextChannel':
			return [ChannelType.GuildText, ChannelType.GuildCategory];
		default:
			return [];
	}
}
