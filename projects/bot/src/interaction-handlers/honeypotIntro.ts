import { resolveOnErrorCodes } from '#common';
import { ApplyOptions } from '@wolfstar/decorators';
import { container, InteractionHandler } from '@wolfstar/http-framework';
import { decodeCustomIdContent, getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { MessageFlags, RESTJSONErrorCodes } from 'discord-api-types/v10';

/**
 * Handles the `Delete now` button of the intro of a honeypot channel (`honeypotIntro.<guildId>.dismiss`): it deletes
 * the message the button is on, for the administrators, who are the ones the intro is for.
 */
@ApplyOptions<InteractionHandler.Options>({ preconditions: ['administrator'] })
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const decoded = decodeCustomIdContent(content);
		const guildId = interaction.guildId ?? null;
		if (
			decoded === null ||
			decoded.action !== 'dismiss' ||
			guildId === null ||
			decoded.sessionId !== guildId ||
			interaction.message === undefined ||
			interaction.channelId === undefined
		) {
			return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });
		}

		const deferred = await interaction.deferUpdate();
		await resolveOnErrorCodes(
			container.gatewayClient.messages.delete(interaction.channelId, interaction.message.id, 'Honeypot'),
			RESTJSONErrorCodes.UnknownMessage,
			RESTJSONErrorCodes.MissingAccess,
			RESTJSONErrorCodes.MissingPermissions
		);
		return deferred;
	}
}
