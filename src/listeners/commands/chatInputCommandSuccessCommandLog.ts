import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, type ChatInputCommandSuccessPayload } from '@sapphire/framework';
import { writeCommandLog } from './_command-log-shared.js';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandSuccess })
export class UserListener extends Listener<typeof Events.ChatInputCommandSuccess> {
	public run(payload: ChatInputCommandSuccessPayload) {
		const { interaction, duration } = payload;
		writeCommandLog({
			guildId: interaction.guildId,
			userId: interaction.user.id,
			commandName: interaction.commandName,
			commandType: 'CHAT_INPUT',
			commandId: interaction.commandId,
			subcommand: interaction.options.getSubcommand(false),
			channelId: interaction.channelId,
			success: true,
			errorReason: null,
			latencyMs: duration !== undefined ? Math.round(duration) : null
		});
	}
}
