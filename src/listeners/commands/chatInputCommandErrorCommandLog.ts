import { Events, Listener, type ChatInputCommandErrorPayload } from '@sapphire/framework';
import { normalizeCommandError, writeCommandLog } from './_command-log-shared.js';

export class UserListener extends Listener<typeof Events.ChatInputCommandError> {
	public run(error: unknown, payload: ChatInputCommandErrorPayload) {
		const { interaction, duration } = payload;
		writeCommandLog({
			guildId: interaction.guildId,
			userId: interaction.user.id,
			userTag: interaction.user.username,
			commandName: interaction.commandName,
			subcommand: interaction.options.getSubcommand(false),
			channelId: interaction.channelId,
			success: false,
			errorReason: normalizeCommandError(error),
			latencyMs: duration !== undefined ? Math.round(duration) : null
		});
	}
}
