import { resolveOnErrorCodes } from '#common';
import { HoneypotChannelNames } from '#lib/moderation/honeypot/upkeep';
import { time, TimestampStyles } from '@discordjs/formatters';
import { sleep } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { encodeCustomId } from '@wolfstar/http-framework-utilities';
import { translateKey } from '#lib/structures/commands/utils';
import type { TFunction } from '@wolfstar/plugin-i18next';
import {
	ButtonStyle,
	ComponentType,
	MessageFlags,
	RESTJSONErrorCodes,
	type RESTPostAPIChannelMessageJSONBody,
	type Snowflake
} from 'discord-api-types/v10';
import { minutes } from 'wolfstar-shared';

/**
 * The name of the interaction handler of the `Delete now` button of the intro, which is also the first part of its
 * custom ID: `honeypotIntro.<guildId>.dismiss`.
 */
export const HoneypotIntroHandlerName = 'honeypotIntro';

/**
 * How long the intro stays in the channel before it deletes itself.
 */
const HoneypotIntroLifetime = minutes(2.5);

/**
 * The errors that mean the intro is already gone, or that the bot can no longer delete it.
 */
const IgnoredCodes = [
	RESTJSONErrorCodes.UnknownMessage,
	RESTJSONErrorCodes.UnknownChannel,
	RESTJSONErrorCodes.MissingAccess,
	RESTJSONErrorCodes.MissingPermissions
] as const;

/**
 * Builds the intro of a honeypot channel the bot just created, as the honeypot bot of RiskyMH posts one: what the
 * channel does, and the tips that make it catch more (a name of its own, near the top of the list, the role of the
 * bot above the ones the members give themselves). It deletes itself after {@linkcode HoneypotIntroLifetime}, and a
 * button deletes it at once.
 *
 * @param t - The function to translate with, in the language of the guild.
 * @param guildId - The guild, which the button carries.
 * @param deletesAt - When the message deletes itself.
 */
function renderHoneypotIntro(t: TFunction, guildId: Snowflake, deletesAt: Date): RESTPostAPIChannelMessageJSONBody {
	// A name of the list the upkeep renames with, so the tip shows what a name of a trap looks like:
	const name = HoneypotChannelNames[Math.floor(Math.random() * HoneypotChannelNames.length)];
	return {
		flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications,
		allowed_mentions: { parse: [] },
		components: [
			{ type: ComponentType.TextDisplay, content: translateKey(t, 'commands/honeypot:intro', { name }) },
			{
				type: ComponentType.Section,
				components: [
					{
						type: ComponentType.TextDisplay,
						content: translateKey(t, 'commands/honeypot:introDeletes', { time: time(deletesAt, TimestampStyles.RelativeTime) })
					}
				],
				accessory: {
					type: ComponentType.Button,
					style: ButtonStyle.Secondary,
					label: translateKey(t, 'commands/honeypot:introDelete'),
					custom_id: encodeCustomId(HoneypotIntroHandlerName, guildId, 'dismiss')
				}
			}
		]
	};
}

/**
 * Sends the intro to a honeypot channel the bot just created, and deletes it after {@linkcode HoneypotIntroLifetime}.
 * A message that cannot be sent is only logged: the channel works without it.
 */
export async function sendHoneypotIntro(t: TFunction, guildId: Snowflake, channelId: Snowflake): Promise<void> {
	const { gatewayClient, logger } = container;
	const deletesAt = new Date(Date.now() + HoneypotIntroLifetime);
	const sent = await resolveOnErrorCodes(
		gatewayClient.api.channels.createMessage(channelId, renderHoneypotIntro(t, guildId, deletesAt)),
		...IgnoredCodes
	);
	if (sent === null) {
		logger.debug(`[Honeypot] Could not send the intro to the channel ${channelId} of the guild ${guildId}`);
		return;
	}

	// The intro is not worth a job: a restart leaves it in the channel, where the button still deletes it.
	void sleep(HoneypotIntroLifetime)
		.then(() => resolveOnErrorCodes(gatewayClient.messages.delete(channelId, sent.id, 'Honeypot'), ...IgnoredCodes))
		.catch((error: unknown) => logger.error('[Honeypot] Could not remove the intro:', error));
}
