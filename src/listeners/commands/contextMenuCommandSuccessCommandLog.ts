import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, type ContextMenuCommandSuccessPayload } from '@sapphire/framework';
import { writeCommandLog } from './_command-log-shared.js';

@ApplyOptions<Listener.Options>({ event: Events.ContextMenuCommandSuccess })
export class UserListener extends Listener<typeof Events.ContextMenuCommandSuccess> {
	public run(payload: ContextMenuCommandSuccessPayload) {
		const { interaction, duration } = payload;
		writeCommandLog({
			guildId: interaction.guildId,
			userId: interaction.user.id,
			userTag: interaction.user.username,
			commandName: interaction.commandName,
			subcommand: null,
			channelId: interaction.channelId,
			success: true,
			errorReason: null,
			latencyMs: Math.round(duration)
		});
	}
}
