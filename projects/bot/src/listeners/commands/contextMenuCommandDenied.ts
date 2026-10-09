import { Listener } from '@wolfstar/http-framework';
import type { ClientEventCommandContext, UserError } from '@wolfstar/http-framework';
import { handleCommandError } from './_chat-input-shared.js';

/**
 * Tells the user why a precondition denied their command, such as a command a server disabled.
 */
export class UserListener extends Listener {
	public run(error: UserError, context: ClientEventCommandContext) {
		return handleCommandError(error, context);
	}
}
