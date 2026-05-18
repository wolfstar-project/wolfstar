import { ApplyOptions } from '@sapphire/decorators';
import { Command, Events, Listener, type MessageCommandSuccessPayload } from '@sapphire/framework';
import { writeCommandLog } from './_command-log-shared.js';

@ApplyOptions<Listener.Options>({ event: Events.MessageCommandSuccess })
export class UserListener extends Listener<typeof Events.MessageCommandSuccess> {
	public run(payload: MessageCommandSuccessPayload) {
		const command = payload.command as Command;
		const { message, duration } = payload;
		writeCommandLog({
			guildId: message.guildId,
			userId: message.author.id,
			userTag: message.author.username,
			commandName: command.name,
			subcommand: null,
			channelId: message.channelId,
			success: true,
			errorReason: null,
			latencyMs: Math.round(duration)
		});
	}
}
