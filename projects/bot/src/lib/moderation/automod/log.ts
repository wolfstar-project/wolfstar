import { resolveOnErrorCodes, toErrorCodeResult } from '#common';
import { updateAutoModerationRule } from '#lib/moderation/automod/rules';
import { sendLogMessage } from '#lib/moderation/logs/send';
import { EmbedBuilder } from '@discordjs/builders';
import { DiscordAPIError, HTTPError } from '@discordjs/rest';
import type { Awaitable } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { canSendEmbeds, isDMChannel, isTextBasedChannel, isThreadChannel } from '@wolfstar/http-framework-utilities/gateway';
import { computePermissionsIn, type Guild, type MessageCreateOptions } from '@wolfstar/plugin-gateway';
import { PermissionFlagsBits, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import type { AutoModerationRule } from 'wolfstar-database';

/**
 * The key the logs of a rule are sent with, see `sendLogMessage`: it is no setting, so the log is a message of the bot,
 * as the moderation log is, and goes whatever `modules.logs` says.
 */
const AutoModerationRuleLogKey = 'automodRule';

/**
 * What the bot needs in the log channel of a rule, which is what the `guildMessageLog` listener asks for before it
 * sends a log (`canSendEmbeds`): to see the channel, to write in it (in a thread, `SendMessagesInThreads` is the one
 * that counts, as the `LoggerManager` reads it) and to embed.
 *
 * @returns The names of the permissions the bot lacks, `null` when the channel is not one of the guild, or not one a
 * log can go to.
 */
export async function getMissingAutoModerationLogPermissions(guildId: Snowflake, channelId: Snowflake): Promise<string[] | null> {
	const { gatewayClient } = container;
	const channel = await resolveOnErrorCodes(gatewayClient.channels.fetch(channelId), RESTJSONErrorCodes.UnknownChannel);
	if (channel === null || !isTextBasedChannel(channel) || isDMChannel(channel) || channel.guildId !== guildId) return null;

	const required = {
		ViewChannel: PermissionFlagsBits.ViewChannel,
		...(isThreadChannel(channel)
			? { SendMessagesInThreads: PermissionFlagsBits.SendMessagesInThreads }
			: { SendMessages: PermissionFlagsBits.SendMessages }),
		EmbedLinks: PermissionFlagsBits.EmbedLinks
	};
	const permissions = await computePermissionsIn(channel, await gatewayClient.members.fetchMe(guildId));
	return Object.entries(required)
		.filter(([, bit]) => !permissions.has(bit))
		.map(([name]) => name);
}

/**
 * Sends the log of a rule to the channel of the rule (`logChannelId`), where the `guildMessageLog` listener sends the
 * ones of the moderation channel. A channel that is gone is taken off the rule, so the log goes to the moderation
 * channel from then on; a channel the bot cannot post in is only logged.
 *
 * @param guild - The guild of the rule.
 * @param rule - The rule, with a `logChannelId`.
 * @param makeMessage - Builds the log, only when it can be sent.
 */
export async function sendAutoModerationRuleLog(
	guild: Guild,
	rule: Pick<AutoModerationRule, 'id' | 'logChannelId'>,
	makeMessage: () => Awaitable<EmbedBuilder | EmbedBuilder[] | MessageCreateOptions>
): Promise<void> {
	const { logger, gatewayClient } = container;
	const { logChannelId } = rule;
	if (logChannelId === null) return;

	const result = await toErrorCodeResult(gatewayClient.channels.fetch(logChannelId));
	const channel = result.unwrapOr(null);
	if (channel === null) {
		logger.debug(`[AutoMod] rule ${rule.id} of ${guild.id}: log not sent, the channel ${logChannelId} could not be read`);
		if (result.isOk() || result.unwrapErr() === RESTJSONErrorCodes.UnknownChannel) {
			// Only the channel that failed is taken off: an administrator may have picked another one meanwhile.
			await updateAutoModerationRule(guild.id, rule.id, (current) =>
				current.logChannelId === logChannelId ? { logChannelId: null } : null
			).catch((error: unknown) => logger.error(`[AutoMod] Could not take the deleted channel ${logChannelId} off the rule ${rule.id}:`, error));
		}
		return;
	}

	if (!isTextBasedChannel(channel) || isDMChannel(channel) || channel.guildId !== guild.id) {
		logger.debug(`[AutoMod] rule ${rule.id} of ${guild.id}: log not sent, the channel ${logChannelId} is not one a log can go to`);
		return;
	}

	if (!(await canSendEmbeds(channel))) {
		logger.debug(`[AutoMod] rule ${rule.id} of ${guild.id}: log not sent, the bot cannot post embeds in ${logChannelId}`);
		return;
	}

	const made = await makeMessage();
	const options: MessageCreateOptions = Array.isArray(made) ? { embeds: made } : made instanceof EmbedBuilder ? { embeds: [made] } : made;
	try {
		await sendLogMessage(channel, AutoModerationRuleLogKey, options);
	} catch (error) {
		logger.error(
			error instanceof DiscordAPIError || error instanceof HTTPError
				? `[AutoMod] Could not send the log of the rule ${rule.id} to ${logChannelId}: [${error.status} - ${error.method}] ${error.message}`
				: `[AutoMod] Could not send the log of the rule ${rule.id} to ${logChannelId}: ${(error as Error).message}`
		);
	}
}
