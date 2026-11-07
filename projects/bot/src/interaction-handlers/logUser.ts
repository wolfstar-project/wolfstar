import { decodeLogUserId } from '#lib/moderation/logs/messageButtons';
import { InteractionHandler } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * Handles the `Get User ID` button under the log of a message: it answers, to who clicked only, with the ID of the user
 * the log is about, as plain text so it can be copied.
 *
 * @remarks The ID is in the log already, and the button is only where who can read the log channel finds it. Nothing
 * is read nor written.
 */
export class UserInteractionHandler extends InteractionHandler {
	public override run(interaction: InteractionHandler.Interaction, content: unknown) {
		const userId = decodeLogUserId(content);
		if (userId === null) return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });

		return interaction.reply({ content: userId, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
