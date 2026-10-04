import type { PartialMessage } from '@wolfstar/http-framework';
import { BrandingColors, Urls, ZeroWidthSpace } from '#utils/constants';
import { EmbedBuilder, type EmbedAuthorOptions } from '@discordjs/builders';
import type { ImageURLOptions } from '@discordjs/rest';
import { DiscordSnowflake } from '@sapphire/snowflake';
import { isNullishOrEmpty, isNullishOrZero, tryParseURL, type Nullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { Guild, GuildMember, Message, User } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import { StickerFormatType, type APIUser, type Snowflake } from 'discord-api-types/v10';

/**
 * Image extensions:
 * - bmp
 * - jpg
 * - jpeg
 * - png
 * - gif
 * - webp
 */
export const IMAGE_EXTENSION = /\.(bmp|jpe?g|png|gif|webp)$/i;

/**
 * Media extensions
 * - ...Image extensions
 * - ...Audio extensions
 * - ...Video extensions
 */
export const MEDIA_EXTENSION = /\.(bmp|jpe?g|png|gifv?|web[pm]|wav|mp[34]|ogg)$/i;

export function radians(degrees: number) {
	return (degrees * Math.PI) / 180;
}

export function snowflakeAge(snowflake: string | bigint) {
	return Math.max(Date.now() - DiscordSnowflake.timestampFrom(snowflake), 0);
}

export function twemoji(emoji: string) {
	const r: string[] = [];
	let c = 0;
	let p = 0;
	let i = 0;

	while (i < emoji.length) {
		c = emoji.charCodeAt(i++);
		if (p) {
			r.push((0x10000 + ((p - 0xd800) << 10) + (c - 0xdc00)).toString(16));
			p = 0;
		} else if (c >= 0xd800 && c <= 0xdbff) {
			p = c;
		} else {
			r.push(c.toString(16));
		}
	}
	return r.join('-');
}

/**
 * Get the content from a message.
 * @param message The Message instance to get the content from
 */
export function getContent(message: Message): string | null {
	if (message.content) return message.content;
	for (const embed of message.embeds) {
		if (embed.description) return embed.description;
		if (embed.fields.length) return embed.fields[0].value;
	}
	return null;
}

/**
 * Gets all the contents from a message.
 * @param message The Message instance to get all contents from
 */
export function getAllContent(message: Message): string {
	const output: string[] = [];
	if (message.content) output.push(message.content);
	for (const embed of message.embeds) {
		if (embed.author?.name) output.push(embed.author.name);
		if (embed.title) output.push(embed.title);
		if (embed.description) output.push(embed.description);
		for (const field of embed.fields) output.push(`${field.name}\n${field.value}`);
		if (embed.footer?.text) output.push(embed.footer.text);
	}

	return output.join('\n');
}

export interface ImageAttachment {
	url: string;
	proxyURL: string;
	height: number;
	width: number;
}

export function* getImages(message: Message): IterableIterator<string> {
	for (const attachment of message.attachments.values()) {
		// Skip if the attachment doesn't have a content type:
		if (isNullishOrEmpty(attachment.contentType)) continue;
		// Skip if the attachment doesn't have a size:
		if (isNullishOrZero(attachment.width) || isNullishOrZero(attachment.height)) continue;
		// Skip if the attachment isn't an image:
		if (!attachment.contentType.startsWith('image/')) continue;

		yield attachment.proxyURL ?? attachment.url;
	}

	for (const embed of message.embeds) {
		if (embed.image) {
			yield embed.image.proxyURL ?? embed.image.url;
		}

		if (embed.thumbnail) {
			yield embed.thumbnail.proxyURL ?? embed.thumbnail.url;
		}
	}

	for (const sticker of message.stickers.values()) {
		// Skip if the sticker is a lottie sticker:
		if (sticker.formatType === StickerFormatType.Lottie) continue;

		yield container.rest.cdn.sticker(sticker.id, sticker.formatType === StickerFormatType.GIF ? 'gif' : 'png');
	}
}

/**
 * Get the image url from a message.
 * @param message The Message instance to get the image url from
 */
export function getImage(message: Message): string | null {
	for (const image of getImages(message)) return image;
	return null;
}

export function setMultipleEmbedImages(embed: EmbedBuilder, urls: IterableIterator<string>) {
	const embeds = [embed];
	let count = 0;
	for (const url of urls) {
		if (count === 0) {
			embed.setURL(Urls.Website).setImage(url);
		} else {
			embeds.push(new EmbedBuilder().setURL(Urls.Website).setImage(url));

			// We only want to send 4 embeds at most
			if (count === 3) break;
		}

		count++;
	}

	return embeds;
}

/**
 * Checks whether or not the user uses the new username change, defined by the
 * `discriminator` being `'0'` or in the future, no discriminator at all.
 * @see {@link https://dis.gd/usernames}
 * @param user The user to check.
 */
export function usesPomelo(user: User | APIUser) {
	return isNullishOrEmpty(user.discriminator) || user.discriminator === '0';
}

export function getDisplayAvatar(user: User | APIUser, options?: Readonly<ImageURLOptions>) {
	if (user.avatar === null) {
		const id = usesPomelo(user) ? Number(BigInt(user.id) >> 22n) % 6 : Number(user.discriminator) % 5;
		return container.rest.cdn.defaultAvatar(id);
	}

	return container.rest.cdn.avatar(user.id, user.avatar, options);
}

export function getTag(user: User | APIUser) {
	return usesPomelo(user) ? `@${user.username}` : `${user.username}#${user.discriminator}`;
}

export function getEmbedAuthor(user: User | APIUser, url?: string | undefined): EmbedAuthorOptions {
	return { name: getTag(user), iconURL: getDisplayAvatar(user, { size: 128 }), url };
}

export function getFullEmbedAuthor(user: User | APIUser, url?: string | undefined): EmbedAuthorOptions {
	return { name: `${getTag(user)} (${user.id})`, iconURL: getDisplayAvatar(user, { size: 128 }), url };
}

/**
 * Parse a range
 * @param input The input to parse
 * @example
 * parseRange('23..25');
 * // -> [23, 24, 25]
 * @example
 * parseRange('1..3,23..25');
 * // -> [1, 2, 3, 23, 24, 25]
 */
export function parseRange(input: string): number[] {
	const set = new Set<number>();
	for (const subset of input.split(',')) {
		const [, stringMin, stringMax] = /(\d+) *\.{2,} *(\d+)/.exec(subset) || [subset, subset, subset];
		let min = Number(stringMin);
		let max = Number(stringMax);
		if (min > max) [max, min] = [min, max];

		for (let i = Math.max(1, min); i <= max; ++i) set.add(i);
	}

	return [...set];
}

/**
 * Parses an URL and checks if the extension is valid.
 * @param url The url to check
 */
export function getImageUrl(url: string): string | undefined {
	const parsed = tryParseURL(url);
	return parsed && IMAGE_EXTENSION.test(parsed.pathname) ? parsed.href : undefined;
}

/**
 * Clean all mentions from a body of text, reading the users, roles and channels from the gateway cache.
 * @param guild The guild for context
 * @param input The input to clean
 * @returns The input cleaned of mentions
 * @license Apache-2.0
 * @copyright 2019 Aura Román
 */
export async function cleanMentions(guild: Guild, input: string): Promise<string> {
	const replacements = new Map<string, string>();
	const text = input.replace(/@(here|everyone)/g, `@${ZeroWidthSpace}$1`);

	for (const [match, type, id] of text.matchAll(anyMentionRegExp)) {
		if (replacements.has(match)) continue;

		switch (type) {
			case '@':
			case '@!': {
				const user = await container.gatewayClient.users.cache.get(id);
				replacements.set(match, user ? `@${user.username}` : `<${type}${ZeroWidthSpace}${id}>`);
				break;
			}
			case '@&': {
				const role = await container.gatewayClient.roles.cache.get(container.gatewayClient.roles.resolveKey(guild.id, id));
				replacements.set(match, role ? `@${role.name}` : match);
				break;
			}
			case '#': {
				const channel = await container.gatewayClient.channels.cache.get(id);
				replacements.set(match, channel && 'name' in channel && channel.name ? `#${channel.name}` : `<${type}${ZeroWidthSpace}${id}>`);
				break;
			}
			default:
				replacements.set(match, `<${type}${ZeroWidthSpace}${id}>`);
		}
	}

	return text.replace(anyMentionRegExp, (match) => replacements.get(match) ?? match);
}

export const anyMentionRegExp = /<(@[!&]?|#)(\d{17,19})>/g;
export const hereOrEveryoneMentionRegExp = /@(?:here|everyone)/;

/**
 * Splits a message into multiple messages if it exceeds a certain length, using a specified character as the delimiter.
 * @param content The message to split.
 * @param options The options for splitting the message.
 * @returns An array of messages split from the original message.
 * @throws An error if the content cannot be split.
 */
export function splitMessage(content: string, options: SplitMessageOptions) {
	if (content.length <= options.maxLength) return [content];

	let last = 0;
	const messages = [] as string[];
	while (last < content.length) {
		// If the last chunk can fit the rest of the content, push it and break:
		if (content.length - last <= options.maxLength) {
			messages.push(content.slice(last));
			break;
		}

		// Find the last best index to split the chunk:
		const index = content.lastIndexOf(options.char, options.maxLength + last);
		if (index === -1) throw new Error('Unable to split content.');

		messages.push(content.slice(last, index + 1));
		last = index + 1;
	}

	return messages;
}

export interface SplitMessageOptions {
	char: string;
	maxLength: number;
}

type MessageMentionTypes = 'users' | 'roles' | 'everyone';

/**
 * Extracts mentions from a body of text.
 * @remark Preserves the mentions in the content, if you want to remove them use `cleanMentions`.
 * @param input The input to extract mentions from.
 */
export function extractDetailedMentions(input: string | Nullish): DetailedMentionExtractionResult {
	const users = new Set<string>();
	const roles = new Set<string>();
	const channels = new Set<string>();
	const parse = [] as MessageMentionTypes[];

	if (isNullishOrEmpty(input)) {
		return { users, roles, channels, parse };
	}

	for (const [, type, id] of input.matchAll(anyMentionRegExp)) {
		switch (type) {
			case '@':
			case '@!': {
				users.add(id);
				continue;
			}
			case '@&': {
				roles.add(id);
				continue;
			}
			case '#': {
				channels.add(id);
				continue;
			}
		}
	}

	if (hereOrEveryoneMentionRegExp.test(input)) parse.push('everyone');

	return { users, roles, channels, parse };
}

export interface DetailedMentionExtractionResult {
	users: ReadonlySet<string>;
	roles: ReadonlySet<string>;
	channels: ReadonlySet<string>;
	parse: MessageMentionTypes[];
}

/**
 * Picks a random item from an array
 * @param array The array to pick a random item from
 * @example
 * const randomEntry = pickRandom([1, 2, 3, 4]) // 1
 */
export function pickRandom<T>(array: readonly T[]): T {
	const { length } = array;
	return array[Math.floor(Math.random() * length)];
}

export function cast<T>(value: unknown): T {
	return value as T;
}

/**
 * Shuffles an array, returning it
 * @param array The array to shuffle
 */
export const shuffle = <T>(array: T[]): T[] => {
	let m = array.length;
	while (m) {
		const i = Math.floor(Math.random() * m--);
		[array[m], array[i]] = [array[i], array[m]];
	}
	return array;
};

export const random = (num: number) => Math.floor(Math.random() * num);

/**
 * Anything that can be answered with a message, such as a slash command interaction.
 */
export interface LoadingMessageTarget {
	reply(options: { embeds: [ReturnType<EmbedBuilder['toJSON']>] }): Promise<PartialMessage>;
}

/**
 * Answers an interaction with a random "loading" embed, to be replaced afterwards through the returned message's `update`.
 * It is the interaction-based counterpart of the `sendLoadingMessage` helper of the message commands.
 * @param interaction The interaction to answer.
 * @param t The translation function of the target language.
 */
export function sendLoadingMessage<T extends LoadingMessageTarget>(interaction: T, t: TFunction<AnyNamespace>): ReturnType<T['reply']> {
	const embed = new EmbedBuilder()
		.setDescription(pickRandom(t('system:loading', { returnObjects: true }) as unknown as readonly string[]))
		.setColor(BrandingColors.Secondary);
	return interaction.reply({ embeds: [embed.toJSON()] }) as ReturnType<T['reply']>;
}

/**
 * Gets the color of a member, which is the color of their highest colored role, or the primary branding color if none
 * of their roles has one.
 * @param source The entity holding the member, such as a message.
 */
export async function getColor(source: { member?: GuildMember | Nullish }): Promise<number> {
	const role = await source.member?.roles.fetchColor();
	return role && role.color !== 0 ? role.color : BrandingColors.Primary;
}

/**
 * Checks if the provided user ID is the same as the client's ID.
 *
 * @param userId - The user ID to check.
 */
export function isUserSelf(userId: Snowflake) {
	return userId === process.env.CLIENT_ID;
}

export interface MuteOptions {
	reason?: string;
	duration?: number | string | null;
}
