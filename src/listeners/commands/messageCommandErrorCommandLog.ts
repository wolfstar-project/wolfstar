import { Command, Events, Listener, type MessageCommandErrorPayload } from '@sapphire/framework';
import { normalizeCommandError, writeCommandLog } from './_command-log-shared.js';

export class UserListener extends Listener<typeof Events.MessageCommandError> {
	public run(error: unknown, payload: MessageCommandErrorPayload) {
		const command = payload.command as Command;
		const { message, duration } = payload;
		writeCommandLog({
			guildId: message.guildId,
			userId: message.author.id,
			userTag: message.author.username,
			commandName: command.name,
			subcommand: null,
			channelId: message.channelId,
			success: false,
			errorReason: normalizeCommandError(error),
			latencyMs: duration !== undefined ? Math.round(duration) : null
		});
	}
}
