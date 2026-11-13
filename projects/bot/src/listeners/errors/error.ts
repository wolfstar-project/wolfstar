import { DiscordAPIError, HTTPError } from '@discordjs/rest';
import { Listener, UserError } from '@wolfstar/http-framework';

const NEWLINE = '\n';

export class UserListener extends Listener {
	public run(error: unknown) {
		// The framework emits everything a command, an autocomplete or an interaction handler throws here too. Those
		// that are not bugs are answered by their own listeners:
		if (typeof error === 'string' || error instanceof UserError) return;

		const { logger } = this.container;
		if (error instanceof DiscordAPIError) {
			logger.warn(`[API ERROR] [CODE: ${error.code}] ${error.message}${NEWLINE}            [PATH: ${error.method} ${error.url}]`);
			logger.fatal(error.stack);
		} else if (error instanceof HTTPError) {
			logger.warn(`[HTTP ERROR] [CODE: ${error.status}] ${error.message}${NEWLINE}             [PATH: ${error.method} ${error.url}]`);
			logger.fatal(error.stack);
		} else {
			logger.error(error);
		}
	}
}
