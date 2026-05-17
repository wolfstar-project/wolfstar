import type { WolfCommand } from '#lib/structures';
import { Events as WolfEvents } from '#lib/types';
import { ApplyOptions } from '@sapphire/decorators';
import { readSettingsAuditLog, readSettingsCached } from '#lib/database';
import { Events, Listener, type MessageCommandSuccessPayload } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({ event: Events.MessageCommandSuccess })
export class UserListener extends Listener<typeof Events.MessageCommandSuccess> {
	public run(payload: MessageCommandSuccessPayload) {
		const command = payload.command as WolfCommand;
		const { message } = payload;
		this.container.client.emit(WolfEvents.CommandUsageAnalytics, command.name, command.category);

		if (!message.guildId || command.category === 'System') return;
		const settings = readSettingsCached(message.guildId);
		if (!settings) return;
		void readSettingsAuditLog(settings)
			.command(message.author.id, {
				commandName: command.name,
				commandType: 'message',
				channelId: message.channelId
			})
			.catch(() => null);
	}
}
