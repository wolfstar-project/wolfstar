import { Serializer } from '#lib/database';
import { getSchemaChannelTypes } from '#lib/database/settings/schema/channelTypes';
import { ApplyOptions } from '@wolfstar/decorators';

@ApplyOptions<Serializer.Options>({
	aliases: ['guildTextChannel', 'guildLogChannel', 'guildVoiceChannel', 'guildCategoryChannel', 'categoryOrTextChannel']
})
export class UserSerializer extends Serializer<string> {
	public async parse(input: string, { t, entry, guild }: Serializer.UpdateContext) {
		const channel = await this.findChannel(guild, input.trim());
		if (channel !== null && getSchemaChannelTypes(entry.type).includes(channel.type)) return this.ok(channel.id);
		return this.error(t('serializers:invalidChannel', { name: entry.name }));
	}

	public async isValid(value: string, { entry, guild }: Serializer.UpdateContext): Promise<boolean> {
		const channel = await this.fetchChannel(guild, value);
		return channel !== null && getSchemaChannelTypes(entry.type).includes(channel.type);
	}

	public override async stringify(value: string, { guild }: Serializer.UpdateContext): Promise<string> {
		const channel = await this.fetchChannel(guild, value);
		return channel !== null && 'name' in channel ? (channel.name ?? value) : value;
	}
}
