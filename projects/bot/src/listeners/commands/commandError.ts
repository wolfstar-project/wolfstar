import { Listener, type ClientEventCommandContext } from '@wolfstar/http-framework';
import { ApplicationCommandType } from 'discord-api-types/v10';
import { handleCommandError } from './_chat-input-shared.js';

export class UserListener extends Listener {
	public run(error: unknown, context: ClientEventCommandContext) {
		if (context.interaction.data.type === ApplicationCommandType.ChatInput) return handleCommandError(error, context);

		const message = error instanceof Error ? error.stack || error.message : String(error);
		this.container.logger.fatal(`[COMMAND] ${context.command.location.full}\n${message}`);
		return undefined;
	}
}
