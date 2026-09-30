import { GuildSettings, readSettings } from '#lib/database';
import { Events } from '#lib/types/Enums';
import { deleteMessage } from '#utils/functions';
import { ApplyOptions } from '@sapphire/decorators';
import { CommandSuccessPayload, Listener, ListenerOptions } from '@sapphire/framework';

@ApplyOptions<ListenerOptions>({ event: Events.CommandSuccess })
export class UserListener extends Listener<Events.CommandSuccess> {
	public async run({ message }: CommandSuccessPayload) {
		if (!message.inGuild()) return;

		const commandAutoDelete = await readSettings(message.guild, GuildSettings.CommandAutoDelete);
		const commandAutoDeleteEntry = commandAutoDelete.find(([id]) => id === message.channel.id);
		if (commandAutoDeleteEntry && message.deletable) {
			await deleteMessage(message, commandAutoDeleteEntry[1]);
		}
	}
}
