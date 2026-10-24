import { ApplyOptions } from '@wolfstar/decorators';
import { Listener, LogLevel, type ClientEventCommandContext } from '@wolfstar/http-framework';
import { cyan } from 'colorette';
import { ApplicationCommandType, type APIUser } from 'discord-api-types/v10';

@ApplyOptions<Listener.Options>({ emitter: 'client', event: 'commandSuccess' })
export class UserListener extends Listener {
	public async run({ interaction }: ClientEventCommandContext) {
		const shard = `[${cyan('0')}]`;
		const commandName = cyan(interaction.data.type === ApplicationCommandType.ChatInput ? `/${interaction.data.name}` : interaction.data.name);
		const author = this.author((interaction.member?.user ?? interaction.user)!);
		const sentAt = interaction.guild_id
			? `${await this.fetchGuildName(interaction.guild_id)}[${cyan(interaction.guild_id)}]`
			: cyan('Direct Messages');
		this.container.logger.debug(`${shard} - ${commandName} ${author} ${sentAt}`);
	}

	public override onLoad() {
		this.enabled = this.container.logger.has(LogLevel.Debug);
		return super.onLoad();
	}

	private author(author: APIUser) {
		return `${author.username}[${cyan(author.id)}]`;
	}

	private async fetchGuildName(guildId: string) {
		const guild = await this.container.gatewayClient.guilds.cache.get(guildId);
		return guild?.name ?? 'Unknown';
	}
}
