import { readSettingsAuditLog, readSettingsCached } from '#lib/database';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, LogLevel, type ContextMenuCommandSuccessPayload } from '@sapphire/framework';
import { cyan } from 'colorette';
import type { User } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.ContextMenuCommandSuccess })
export class UserListener extends Listener<typeof Events.ContextMenuCommandSuccess> {
	public run({ interaction }: ContextMenuCommandSuccessPayload) {
		const shard = `[${cyan('0')}]`;
		const commandName = cyan(interaction.commandName);
		const author = this.author(interaction.user);
		const sentAt = interaction.guildId ? `${interaction.guild?.name ?? 'Unknown'}[${cyan(interaction.guildId)}]` : cyan('Direct Messages');
		this.container.logger.debug(`${shard} - ${commandName} ${author} ${sentAt}`);

		if (!interaction.guildId) return;
		const settings = readSettingsCached(interaction.guildId);
		if (!settings) return;
		void readSettingsAuditLog(settings)
			.command(interaction.user.id, {
				commandName: interaction.commandName,
				commandType: 'context-menu',
				channelId: interaction.channelId
			})
			.catch(() => null);
	}

	public override onLoad() {
		this.enabled = this.container.logger.has(LogLevel.Debug);
		return super.onLoad();
	}

	private author(author: User) {
		return `${author.username}[${cyan(author.id)}]`;
	}
}
