import { toErrorCodeResult } from '#common';
import { readSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import type { GuildTextBasedChannel } from '#lib/moderation/managers';
import { Events } from '#lib/types';
import type { LLRCData, LLRCDataEmoji } from '#utils/LongLivingReactionCollector';
import { Colors } from '#utils/constants';
import {
	getCodeStyle,
	getCustomEmojiUrl,
	getEmojiId,
	getEmojiReactionFormat,
	getEncodedTwemoji,
	getLogPrefix,
	getLogger,
	getTwemojiUrl,
	type SerializedEmoji
} from '#utils/functions';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder } from '@discordjs/builders';
import { Collection } from '@discordjs/collection';
import { inlineCode, messageLink } from '@discordjs/formatters';
import { isNullish } from '@sapphire/utilities';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import { computePermissionsIn } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import { PermissionFlagsBits, RESTJSONErrorCodes, type RESTGetAPIChannelMessageReactionUsersResult } from 'discord-api-types/v10';

@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.RawReactionAdd })
export class UserListener extends Listener {
	private readonly kCountCache = new Collection<string, InternalCacheEntry>();
	private readonly kSyncCache = new Collection<string, Promise<InternalCacheEntry | null>>();
	private kTimerSweeper: NodeJS.Timeout | null = null;

	public async run(data: LLRCData, emoji: SerializedEmoji) {
		// The reaction only carries the id of its channel, which `rawMessageReactionAdd` already found in the cache:
		const channel = (await this.container.gatewayClient.channels.resolve(data.channelId)) as GuildTextBasedChannel | null;
		if (isNullish(channel)) return;

		// If the bot cannot fetch messages, do not proceed:
		if (!(await this.#canFetchMessages(channel))) return;

		const settings = await readSettings(data.guildId);
		const targetChannelId = settings.logsReaction;

		this.container.client.emit(Events.ReactionBlocked, data, emoji);
		if (isNullish(targetChannelId) || (!settings.logsEmojiAddIncludeTwemoji && data.emoji.id === null)) return;

		if (settings.logsIgnoreReactions.some((id) => id === channel.id || channel.parentId === id)) return;
		if (settings.logsIgnoreAll.some((id) => id === channel.id || channel.parentId === id)) return;

		const count = await this.#retrieveCount(data, emoji);
		if (isNullish(count) || count > 1) return;

		const user = await this.container.gatewayClient.users.fetch(data.userId);
		if (user.bot) return;

		const t = await fetchGuildT({ id: data.guildId });
		const logger = await getLogger(data.guildId);
		await logger.send({
			key: 'logsReaction',
			channelId: targetChannelId,
			makeMessage: () =>
				new EmbedBuilder()
					.setColor(Colors.Green)
					.setAuthor(getFullEmbedAuthor(user))
					.setThumbnail(this.#renderThumbnail(data.emoji))
					.setDescription(this.#renderDescription(t, data))
					.setFooter({ text: t('events/reactions:reactionFooter') })
					.setTimestamp()
		});
	}

	public override onUnload() {
		super.onUnload();
		if (this.kTimerSweeper) clearInterval(this.kTimerSweeper);
	}

	#renderThumbnail(emoji: LLRCDataEmoji) {
		return emoji.id === null //
			? getTwemojiUrl(getEncodedTwemoji(emoji.name!))
			: getCustomEmojiUrl(emoji.id, emoji.animated);
	}

	#renderDescription(t: TFunction<AnyNamespace>, data: LLRCData) {
		return t('events/reactions:reactionDescription', {
			emoji: data.emoji.id ? `${data.emoji.name} (${inlineCode(data.emoji.id)})` : data.emoji.name!,
			message: messageLink(data.channelId, data.messageId, data.guildId)
		});
	}

	async #canFetchMessages(channel: GuildTextBasedChannel) {
		const me = await this.container.gatewayClient.members.fetchMe(channel.guildId!);
		const permissions = await computePermissionsIn(channel, me);
		return permissions.has(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory);
	}

	async #retrieveCount(data: LLRCData, emoji: SerializedEmoji): Promise<number | null> {
		const id = `${data.messageId}.${getEmojiId(emoji)}`;

		// Pull from sync queue, and if it exists, await
		const sync = this.kSyncCache.get(id);
		if (typeof sync !== 'undefined') await sync;

		// Retrieve the reaction count
		const previousCount = this.kCountCache.get(id);
		if (typeof previousCount !== 'undefined') {
			previousCount.count++;
			previousCount.sweepAt = Date.now() + 120000;
			return previousCount.count;
		}

		// Pull the reactions from the API
		const promise = this.#fetchCount(data, emoji, id);
		this.kSyncCache.set(id, promise);

		const resolved = await promise;
		return isNullish(resolved) ? null : resolved.count;
	}

	async #fetchCount(data: LLRCData, emoji: SerializedEmoji, id: string): Promise<InternalCacheEntry | null> {
		const result = await toErrorCodeResult(
			this.container.gatewayClient.api.channels.getMessageReactions(data.channelId, data.messageId, getEmojiReactionFormat(emoji))
		);
		return result.match({
			ok: (data) => this.#fetchCountOk(data, id),
			err: (error) => this.#fetchCountErr(error)
		});
	}

	#fetchCountOk(data: RESTGetAPIChannelMessageReactionUsersResult, id: string): InternalCacheEntry {
		const count: InternalCacheEntry = { count: data.length, sweepAt: Date.now() + 120000 };
		this.kCountCache.set(id, count);
		this.kSyncCache.delete(id);

		if (this.kTimerSweeper === null) {
			this.kTimerSweeper = setInterval(() => {
				const now = Date.now();
				this.kCountCache.sweep((entry) => entry.sweepAt < now);
				if (this.kTimerSweeper !== null && this.kCountCache.size === 0) {
					clearInterval(this.kTimerSweeper);
					this.kTimerSweeper = null;
				}
			}, 5000).unref();
		}

		return count;
	}

	#fetchCountErr(code: RESTJSONErrorCodes): InternalCacheEntry | null {
		if (!UserListener.IgnoreReactionCountFetchErrors.includes(code)) {
			this.container.logger.error(`${getLogPrefix(this)} ${getCodeStyle(code)} Failed to fetch message reaction count.`);
		}

		return null;
	}

	private static readonly IgnoreReactionCountFetchErrors = [
		RESTJSONErrorCodes.UnknownMessage,
		RESTJSONErrorCodes.UnknownChannel,
		RESTJSONErrorCodes.UnknownGuild,
		RESTJSONErrorCodes.UnknownEmoji,
		RESTJSONErrorCodes.MissingAccess
	];
}

interface InternalCacheEntry {
	sweepAt: number;
	count: number;
}
