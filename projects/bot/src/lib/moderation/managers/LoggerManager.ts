import { writeSettings } from '#lib/database';
import { type GuildSettingsOfType } from 'wolfstar-database';
import { PruneLoggerTypeManager, TimeoutLoggerTypeManager } from '#lib/moderation/managers/loggers';
import { toErrorCodeResult } from '#common';
// Not the barrel: it loads `guild.ts`, which loads the managers, this file included.
import { getCodeStyle, getLogPrefix } from '#utils/functions/pieces';
import { EmbedBuilder } from '@discordjs/builders';
import { isFunction, isNullish, isNullishOrEmpty, type Awaitable, type Nullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import {
	computePermissionsIn,
	type AnyChannel,
	type DMChannel,
	type Guild,
	type GroupDMChannel,
	type MessageCreateOptions
} from '@wolfstar/plugin-gateway';
import { PermissionFlagsBits, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';

/**
 * A text-based channel of a guild, where the logger can send messages to.
 */
export type GuildTextBasedChannel = Exclude<Extract<AnyChannel, { send: unknown }>, DMChannel | GroupDMChannel>;

export class LoggerManager {
	public readonly timeout = new TimeoutLoggerTypeManager(this);
	public readonly prune = new PruneLoggerTypeManager(this);
	public readonly guild: Guild;

	public constructor(guild: Guild) {
		this.guild = guild;
	}

	/**
	 * Whether or not the bot can view audit logs.
	 *
	 * @remarks
	 *
	 * The permissions of the bot's member are read through the gateway cache,
	 * which is asynchronous, therefore this is a method instead of a getter.
	 */
	public async canViewAuditLogs() {
		const me = await container.gatewayClient.members.fetchMe(this.guild.id);
		const permissions = await me.permissions;
		return permissions.has(PermissionFlagsBits.ViewAuditLog);
	}

	/**
	 * Send a message to the specified channel.
	 * @param options The options to send the message.
	 * @returns Whether the message was sent.
	 */
	public async send(options: LoggerManagerSendOptions): Promise<boolean> {
		if (isNullish(options.channelId) || !this.#resolveSendCondition(options.condition)) {
			options.onAbort?.();
			return false;
		}

		const result = await toErrorCodeResult(container.gatewayClient.channels.fetch(options.channelId));
		return result.match({
			ok: (channel) => this.#sendChannelOk(options, channel),
			err: (code) => this.#sendChannelErr(options, code)
		});
	}

	async #sendChannelOk(options: LoggerManagerSendOptions, channel: AnyChannel | null) {
		// Unsupported channel type, or a channel from another guild, should never happen:
		if (isNullish(channel) || !this.#isGuildTextBasedChannel(channel)) {
			options.onAbort?.();
			return false;
		}

		const rawOptions = await options.makeMessage(channel);
		if (rawOptions === null) return false;

		const messageOptions = this.#resolveMessageOptions(rawOptions);

		let requiredPermissions = PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel;
		if (!isNullishOrEmpty(messageOptions.embeds)) requiredPermissions |= PermissionFlagsBits.EmbedLinks;
		if (!isNullishOrEmpty(messageOptions.files)) requiredPermissions |= PermissionFlagsBits.AttachFiles;

		const me = await container.gatewayClient.members.fetchMe(this.guild.id);
		const hasPermissions = (await computePermissionsIn(channel, me)).has(requiredPermissions);
		if (!hasPermissions) return false;

		const result = await toErrorCodeResult(channel.send(messageOptions));
		return result //
			.inspectErr((code) => this.#logError(code, options.channelId!, 'Failed to send message in'))
			.isOk();
	}

	async #sendChannelErr(options: LoggerManagerSendOptions, code: RESTJSONErrorCodes) {
		options.onAbort?.();

		// If the channel was not found, clear the settings:
		if (code === RESTJSONErrorCodes.UnknownChannel) {
			await writeSettings(this.guild, { [options.key]: null });
		} else {
			this.#logError(code, options.channelId!, 'Failed to fetch channel');
		}

		return false;
	}

	#isGuildTextBasedChannel(channel: AnyChannel): channel is GuildTextBasedChannel {
		return 'send' in channel && 'guildId' in channel && channel.guildId === this.guild.id;
	}

	#resolveSendCondition(condition: boolean | (() => boolean) | Nullish) {
		if (isNullish(condition)) return true;
		if (isFunction(condition)) return condition();
		return condition;
	}

	#resolveMessageOptions(options: NonNullable<LoggerManagerSendMessageOptions>): MessageCreateOptions {
		if (Array.isArray(options)) return { embeds: options };
		if (options instanceof EmbedBuilder) return { embeds: [options] };
		return options;
	}

	#logError(code: RESTJSONErrorCodes, channelId: Snowflake, content: string) {
		container.logger.error(`${LogPrefix} ${getCodeStyle(code)} ${content} ${channelId}`);
	}
}

export interface LoggerManagerSendOptions {
	/**
	 * The settings key to reset if the channel is not found.
	 */
	key: GuildSettingsOfType<string | Nullish>;
	/**
	 * The channel ID to send the message to, if any.
	 */
	channelId: string | Nullish;
	/**
	 * The condition to check before sending the message, if any.
	 */
	condition?: boolean | (() => boolean);
	/**
	 * Makes the options for the message to send.
	 * @returns The message options to send.
	 */
	makeMessage: (channel: GuildTextBasedChannel) => Awaitable<LoggerManagerSendMessageOptions>;
	/**
	 * The function to call when the log operation was aborted before calling
	 * {@linkcode makeMessage}.
	 */
	onAbort?: () => void;
}

export type LoggerManagerSendMessageOptions = MessageCreateOptions | EmbedBuilder | EmbedBuilder[] | null;

const LogPrefix = getLogPrefix('LoggerManager');
