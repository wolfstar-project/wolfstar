import { makeInteraction, type ClientEventCommandContext } from '@wolfstar/http-framework';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';
import { flattenError, generateUnexpectedErrorMessage, resolveError } from './_shared.js';

/**
 * Replies to the user with the reason their command failed.
 *
 * @remarks
 *
 * The framework ends the HTTP response with a 500 right after it emits `commandError`, so the reply has to be written
 * before this function first awaits: nothing asynchronous may run before `interaction.reply()`.
 *
 * A response that ended was either replied or deferred, which the framework does not tell apart. A follow-up covers
 * both: the first follow-up of a deferred interaction edits its "thinking" message.
 */
export async function handleCommandError(error: unknown, context: ClientEventCommandContext) {
	const interaction = makeInteraction(context.response, context.interaction);
	const t = getSupportedUserLanguageT(interaction);
	const resolved = flattenError(context.command, error);
	const content = resolved ? resolveError(t, resolved) : generateUnexpectedErrorMessage(interaction.user.id, context.command, t, error);

	try {
		if (interaction.replied) await interaction.followup({ content, flags: MessageFlags.Ephemeral });
		else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
	} catch {}
}
