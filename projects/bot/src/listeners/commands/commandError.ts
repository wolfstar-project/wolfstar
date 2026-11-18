import { reportCommandErrorToWebhook } from '#utils/errorWebhook';
import { Listener, type ClientEventCommandContext } from '@wolfstar/http-framework';
import { ApplicationCommandType } from 'discord-api-types/v10';
import { handleCommandError } from './_chat-input-shared.js';

export class UserListener extends Listener {
	public run(error: unknown, context: ClientEventCommandContext) {
		// The reply has to be written before anything is awaited (see `handleCommandError`), so the report comes after:
		const reply =
			context.interaction.data.type === ApplicationCommandType.ChatInput ? handleCommandError(error, context) : this.log(error, context);
		void reportCommandErrorToWebhook(error, context);
		return reply;
	}

	private log(error: unknown, context: ClientEventCommandContext) {
		const message = error instanceof Error ? error.stack || error.message : String(error);
		this.container.logger.fatal(`[COMMAND] ${context.command.location.full}\n${message}`);
		return undefined;
	}
}
