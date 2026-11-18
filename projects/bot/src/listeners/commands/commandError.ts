import { reportCommandErrorToWebhook } from '#utils/errorWebhook';
import { Listener, type ClientEventCommandContext } from '@wolfstar/http-framework';
import { ApplicationCommandType } from 'discord-api-types/v10';
import { handleCommandError } from './_chat-input-shared.js';
import { flattenError } from './_shared.js';

export class UserListener extends Listener {
	public run(error: unknown, context: ClientEventCommandContext) {
		// `flattenError` logs the error, and returns `null` for what has no answer for the user: a bug.
		const resolved = flattenError(context.command, error);

		// The reply has to be written before anything is awaited (see `handleCommandError`), so the report comes after:
		const reply = context.interaction.data.type === ApplicationCommandType.ChatInput ? handleCommandError(error, context, resolved) : undefined;
		if (resolved === null) void reportCommandErrorToWebhook(error, context);
		return reply;
	}
}
