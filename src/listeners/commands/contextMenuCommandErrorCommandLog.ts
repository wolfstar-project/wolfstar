import { Events, Listener, type ContextMenuCommandErrorPayload } from '@sapphire/framework';
import { normalizeCommandError, writeCommandLog } from './_command-log-shared.js';

export class UserListener extends Listener<typeof Events.ContextMenuCommandError> {
	public run(error: unknown, payload: ContextMenuCommandErrorPayload) {
		const { interaction, duration } = payload;
		writeCommandLog({
			guildId: interaction.guildId,
			userId: interaction.user.id,
			commandName: interaction.commandName,
			commandType: 'CONTEXT_MENU',
			commandId: interaction.commandId,
			subcommand: null,
			channelId: interaction.channelId,
			success: false,
			errorReason: normalizeCommandError(error),
			latencyMs: duration !== undefined ? Math.round(duration) : null
		});
	}
}
