import { Serializer } from '#lib/database';
import { ChannelType } from 'discord-api-types/v10';

export class UserSerializer extends Serializer<string> {
	public async parse(input: string, { t, entry, guild }: Serializer.UpdateContext) {
		const channel = await this.findChannel(guild, input.trim());
		if (channel !== null && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildCategory)) {
			return this.ok(channel.id);
		}

		return this.error(t('serializers:invalidChannel', { name: entry.name }));
	}

	public async isValid(value: string, { guild }: Serializer.UpdateContext): Promise<boolean> {
		return (await this.fetchChannel(guild, value)) !== null;
	}

	public override async stringify(value: string, { guild }: Serializer.UpdateContext): Promise<string> {
		const channel = await this.fetchChannel(guild, value);
		return channel !== null && 'name' in channel ? (channel.name ?? value) : value;
	}
}
