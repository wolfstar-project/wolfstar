import { Serializer } from '#lib/database';
import { ApplyOptions } from '@wolfstar/decorators';
import type { AnyChannel } from '@wolfstar/plugin-gateway';
import { ChannelType } from 'discord-api-types/v10';

type SerializerType = 'guildTextChannel' | 'guildVoiceChannel' | 'guildCategoryChannel';

@ApplyOptions<Serializer.Options>({
	aliases: ['guildTextChannel', 'guildVoiceChannel', 'guildCategoryChannel'] satisfies SerializerType[]
})
export class UserSerializer extends Serializer<string> {
	public async parse(input: string, { t, entry, guild }: Serializer.UpdateContext) {
		const channel = await this.findChannel(guild, input.trim());
		if (channel !== null && this.isValidChannel(channel, entry.type as SerializerType)) return this.ok(channel.id);
		return this.error(t('serializers:invalidChannel', { name: entry.name }));
	}

	public async isValid(value: string, { entry, guild }: Serializer.UpdateContext): Promise<boolean> {
		const channel = await this.fetchChannel(guild, value);
		return channel !== null && this.isValidChannel(channel, entry.type as SerializerType);
	}

	public override async stringify(value: string, { guild }: Serializer.UpdateContext): Promise<string> {
		const channel = await this.fetchChannel(guild, value);
		return channel !== null && 'name' in channel ? (channel.name ?? value) : value;
	}

	private isValidChannel(channel: AnyChannel, type: SerializerType): boolean {
		switch (type) {
			case 'guildTextChannel':
				return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
			case 'guildVoiceChannel':
				return channel.type === ChannelType.GuildVoice;
			case 'guildCategoryChannel':
				return channel.type === ChannelType.GuildCategory;
			default:
				return false;
		}
	}
}
