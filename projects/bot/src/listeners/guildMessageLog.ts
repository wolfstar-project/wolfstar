import { writeSettings } from '#lib/database';
import { sendLogMessage } from '#lib/moderation/logs/send';
import { toErrorCodeResult } from '#common';
import { EmbedBuilder } from '@discordjs/builders';
import { DiscordAPIError, HTTPError } from '@discordjs/rest';
import { isNullish, type Awaitable, type Nullish } from '@sapphire/utilities';
import { Listener } from '@wolfstar/http-framework';
import { canSendEmbeds, isDMChannel, isTextBasedChannel } from '@wolfstar/http-framework-utilities/gateway';
import type { Guild, MessageCreateOptions } from '@wolfstar/plugin-gateway';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';
import type { GuildSettingsOfType } from 'wolfstar-database';

export class UserListener extends Listener {
	public async run(
		guild: Guild,
		logChannelId: string | Nullish,
		key: GuildSettingsOfType<string | Nullish>,
		makeMessage: () => Awaitable<EmbedBuilder | EmbedBuilder[] | MessageCreateOptions>
	) {
		const { logger } = this.container;
		if (isNullish(logChannelId)) {
			logger.debug(`[Logs] ${key} of the guild ${guild.id}: not sent, no channel is set`);
			return;
		}

		// The channels are not cached in memory, an unknown channel is one the cache and the API do not have:
		const result = await toErrorCodeResult(this.container.gatewayClient.channels.fetch(logChannelId));
		const channel = result.unwrapOr(null);
		if (isNullish(channel)) {
			logger.debug(`[Logs] ${key} of the guild ${guild.id}: not sent, the channel ${logChannelId} could not be read`);
			if (result.isOk() || result.unwrapErr() === RESTJSONErrorCodes.UnknownChannel) {
				await writeSettings(guild, { [key]: null }, this.container.gatewayClient.user!.id);
			}
			return;
		}

		// Unsupported channel type, or a channel from another guild, should never happen:
		if (!isTextBasedChannel(channel) || isDMChannel(channel) || channel.guildId !== guild.id) {
			logger.debug(`[Logs] ${key} of the guild ${guild.id}: not sent, the channel ${logChannelId} is not one a log can go to`);
			return;
		}

		// Don't post if it's not possible
		if (!(await canSendEmbeds(channel))) {
			logger.debug(`[Logs] ${key} of the guild ${guild.id}: not sent, the bot cannot post embeds in ${logChannelId}`);
			return;
		}

		const options = this.resolveOptions(await makeMessage());
		try {
			await sendLogMessage(channel, key, options);
		} catch (error) {
			this.container.logger.fatal(
				error instanceof DiscordAPIError || error instanceof HTTPError
					? `Failed to send '${key}' log for guild ${guild} in channel ${channel.name}. Error: [${error.status} - ${error.method} | ${error.url}] ${error.message}`
					: `Failed to send '${key}' log for guild ${guild} in channel ${channel.name}. Error: ${(error as Error).message}`
			);
		}
	}

	private resolveOptions(options: MessageCreateOptions | EmbedBuilder | EmbedBuilder[]): MessageCreateOptions {
		if (Array.isArray(options)) return { embeds: options };
		if (options instanceof EmbedBuilder) return { embeds: [options] };
		return options;
	}
}
