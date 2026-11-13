import { decodeAutoMessageModalId } from '#lib/automessages/ids';
import { AutoMessageContentInputId, AutoMessageRoot } from '#lib/automessages/render';
import { AutoMessagePermissions } from '#lib/automessages/send';
import { AutoMessageLimitError, enableAutoMessage } from '#lib/automessages/store';
import { createTranslator } from '#lib/structures/commands/utils';
import { resolveOnErrorCodes } from '#common';
import { getModalValue } from 'wolfstar-shared';
import { channelMention } from '@discordjs/formatters';
import { ApplyOptions } from '@wolfstar/decorators';
import { InteractionHandler, ModalSubmitInteraction } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { computePermissionsIn } from '@wolfstar/plugin-gateway';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags, RESTJSONErrorCodes } from 'discord-api-types/v10';
import { MaximumAutoMessageLength } from 'wolfstar-database';

const Root = AutoMessageRoot;

/**
 * Reads the modal of `/automessage enable`: the options of the command are in its custom ID, see
 * `lib/automessages/ids.ts`, and the text is what was written in it.
 */
@ApplyOptions<InteractionHandler.Options>({ preconditions: ['administrator'] })
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const { guildId } = interaction;
		const action = decodeAutoMessageModalId(content);
		const reply = (message: string) => interaction.reply({ content: message, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
		if (action === null || guildId === undefined || !(interaction instanceof ModalSubmitInteraction)) return reply(getDefaultExpiredReply());

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const text = getModalValue(interaction.data.components, AutoMessageContentInputId)?.trim() ?? '';
		if (text.length === 0) return reply(t(`${Root}:contentRequired`));

		const channel = channelMention(action.channelId);
		const missing = await this.#getMissingPermissions(guildId, action.channelId);
		if (missing === null) return reply(t(`${Root}:channelUnknown`));
		if (missing.length > 0) return reply(t(`${Root}:missingPermissions`, { channel, missing }));

		try {
			await enableAutoMessage(guildId, {
				channelId: action.channelId,
				content: text.slice(0, MaximumAutoMessageLength),
				interval: action.interval,
				mentions: action.mentions
			});
		} catch (error) {
			if (!(error instanceof AutoMessageLimitError)) throw error;
			return reply(t(`${Root}:automessageLimit`, { maximum: error.maximum }));
		}

		const interval = t('globals:durationValue', { value: action.interval });
		return reply(t(action.mentions ? `${Root}:automessageEnabledWithMentions` : `${Root}:automessageEnabled`, { channel, interval }));
	}

	/**
	 * The permissions the bot needs to send the message in the channel and does not have in it.
	 *
	 * @returns Their names, none when the bot has them all, or `null` when the channel is not one of the guild.
	 */
	async #getMissingPermissions(guildId: string, channelId: string): Promise<string[] | null> {
		const { gatewayClient } = this.container;
		const channel = await resolveOnErrorCodes(gatewayClient.channels.fetch(channelId), RESTJSONErrorCodes.UnknownChannel);
		if (channel === null || !('guildId' in channel) || channel.guildId !== guildId) return null;

		const permissions = await computePermissionsIn(channel, await gatewayClient.members.fetchMe(guildId));
		return Object.entries(AutoMessagePermissions)
			.filter(([, bit]) => !permissions.has(bit))
			.map(([name]) => name);
	}
}
