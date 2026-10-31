import { Listener, makeInteraction } from '@wolfstar/http-framework';
import type { ClientEventInteractionHandlerContext, UserError } from '@wolfstar/http-framework';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';
import { resolveError } from './_shared.js';

/**
 * Tells the user why a precondition denied their click or their modal, such as a member who is not an administrator.
 *
 * @remarks The framework ends the HTTP response right after it emits the event, so the reply is written before the
 * first `await`.
 */
export class UserListener extends Listener {
	public async run(error: UserError, context: ClientEventInteractionHandlerContext) {
		const interaction = makeInteraction(context.response, context.interaction);
		const content = resolveError(getSupportedUserLanguageT(interaction), error);

		try {
			await interaction.reply({ content, flags: MessageFlags.Ephemeral });
		} catch {}
	}
}
