import type { APIUser } from 'discord-api-types/v10';
import {
	ComponentType,
	MessageFlags,
	type AllowedMentionsTypes,
	type APIActionRowComponent,
	type APIButtonComponent,
	type APIComponentInContainer,
	type APIContainerComponent,
	type APIMessageTopLevelComponent,
	type APITextDisplayComponent
} from 'discord-api-types/v10';
import { getDisplayAvatar, getFullEmbedAuthor } from '#utils/util';
import { time, TimestampStyles } from '@discordjs/formatters';

/**
 * The blocks of a log that are never cut: each is a component of its own, kept whole, for a text that cannot be cut
 * anywhere (a code block that is cut leaves its second half without a fence, and what it quotes is read as Markdown
 * again). The blocks that do not fit in what is left of the message are left out, the first one that does not and the
 * ones after it, instead of being cut.
 */
export interface LogBlocks {
	blocks: readonly string[];
}

/**
 * What a log message is made of.
 */
export interface LogMessageOptions {
	/**
	 * The color of the stripe on the side of the message.
	 */
	color: number;

	/**
	 * The user the log is about, shown at the top with their avatar next to it.
	 */
	author: Pick<APIUser, 'id' | 'username' | 'discriminator' | 'avatar' | 'global_name'>;

	/**
	 * The text of the log, which is split in several blocks when it does not fit in one. A list is several parts of text:
	 * each one starts a block of its own, and when they do not fit the message together, the longest are cut first
	 * ({@linkcode fitLogParts}). {@linkcode LogBlocks} are blocks that are never cut.
	 */
	content: string | readonly string[] | LogBlocks;

	/**
	 * The line at the bottom of the message, together with the time of the log.
	 */
	footer: string;

	/**
	 * When the logged event happened, now by default.
	 */
	timestamp?: Date;
}

/**
 * Discord only lets a message made of components hold this many characters of text in all of its text displays.
 */
export const MaximumLogMessageLength = 4000;

/**
 * The most a block of the content of a log holds, the fields of the embeds this replaces held 1024.
 */
const MaximumBlockLength = 1024;

/**
 * Builds the message of a log, which is made of components (a container) instead of an embed: the author with their
 * avatar, the content in blocks, and the footer with the time.
 *
 * @remarks
 *
 * The embeds had an author, fields, a footer and a timestamp, and the components have none of them, so each is a piece
 * of the container: a section with the avatar for the author, a block of text for every 1024 characters of the content
 * (the length of a field), and a small text for the footer. The text of all the blocks is cut to
 * {@linkcode MaximumLogMessageLength}. A caller that gives {@linkcode LogBlocks} gets each of them whole.
 *
 * @param options - What the message is made of.
 */
export function createLogMessage(options: LogMessageOptions) {
	const header = `**${getFullEmbedAuthor(options.author as APIUser).name}**`;
	const footer = `-# ${options.footer} • ${time(options.timestamp ?? new Date(), TimestampStyles.ShortDateTime)}`;

	// The header and the footer count against the limit too:
	const available = Math.max(0, MaximumLogMessageLength - header.length - footer.length);
	const blocks = toContentBlocks(options.content, available);

	const container: APIContainerComponent = {
		type: ComponentType.Container,
		accent_color: options.color,
		components: [
			{
				type: ComponentType.Section,
				components: [{ type: ComponentType.TextDisplay, content: header }],
				accessory: { type: ComponentType.Thumbnail, media: { url: getDisplayAvatar(options.author as APIUser, { size: 128 }) } }
			},
			...blocks,
			{ type: ComponentType.Separator },
			{ type: ComponentType.TextDisplay, content: footer }
		]
	};

	const components: APIMessageTopLevelComponent[] = [container];
	// The log mentions users and roles it only quotes, nobody is pinged:
	return { components, flags: MessageFlags.IsComponentsV2 as const, allowed_mentions: { parse: [] as AllowedMentionsTypes[] } };
}

/**
 * What the log of an event of a message is made of: the title says what happened, who and where follow it, then the
 * content, and at the bottom the IDs and the time, with the buttons under the message.
 */
export interface EventLogMessageOptions {
	/**
	 * The color of the stripe on the side of the message.
	 */
	color: number;

	/**
	 * What happened, the first line: `Message Edited`.
	 */
	title: string;

	/**
	 * Who did it and where, under the title: `From: @member In: #channel`.
	 */
	details: string;

	/**
	 * The text of the log, see {@linkcode LogMessageOptions.content}.
	 */
	content: LogMessageOptions['content'];

	/**
	 * The images the log shows after its text, 10 at most.
	 */
	images?: readonly string[];

	/**
	 * The line at the bottom of the message, together with the time of the log: the IDs a moderator copies.
	 */
	footer: string;

	/**
	 * When the logged event happened, now by default.
	 */
	timestamp?: Date;

	/**
	 * The buttons under the message, 5 at most.
	 */
	buttons?: readonly APIButtonComponent[];
}

/**
 * The most images a log shows, which is what a media gallery holds.
 */
const MaximumLogImages = 10;

/**
 * Builds the message of the log of an event of a message (an edit, a deletion), the way a moderator reads it at a
 * glance: the title, `From` and `In`, the content, a footer with the IDs and the time, and the buttons that jump to
 * the message and copy who sent it.
 *
 * @remarks It has no avatar next to it, which {@linkcode createLogMessage} has for the logs of a member. The buttons are
 * under the container, as the components of a message are, and the mentions are not pinged.
 *
 * @param options - What the message is made of.
 */
export function createEventLogMessage(options: EventLogMessageOptions) {
	const title = `### ${options.title}`;
	const footer = `-# ${options.footer} • ${time(options.timestamp ?? new Date(), TimestampStyles.ShortDateTime)}`;

	// The title, the details and the footer count against the limit too:
	const available = Math.max(0, MaximumLogMessageLength - title.length - options.details.length - footer.length);
	const blocks = toContentBlocks(options.content, available);

	const images = (options.images ?? []).slice(0, MaximumLogImages);
	const gallery: APIComponentInContainer[] =
		images.length === 0 ? [] : [{ type: ComponentType.MediaGallery, items: images.map((url) => ({ media: { url } })) }];

	const container: APIContainerComponent = {
		type: ComponentType.Container,
		accent_color: options.color,
		components: [
			{ type: ComponentType.TextDisplay, content: title },
			{ type: ComponentType.TextDisplay, content: options.details },
			{ type: ComponentType.Separator },
			...blocks,
			...gallery,
			{ type: ComponentType.Separator },
			{ type: ComponentType.TextDisplay, content: footer }
		]
	};

	const components: APIMessageTopLevelComponent[] = [container];
	if (options.buttons !== undefined && options.buttons.length > 0) {
		const row: APIActionRowComponent<APIButtonComponent> = { type: ComponentType.ActionRow, components: options.buttons.slice(0, 5) };
		components.push(row);
	}

	// The log mentions users and channels it only quotes, nobody is pinged:
	return { components, flags: MessageFlags.IsComponentsV2 as const, allowed_mentions: { parse: [] as AllowedMentionsTypes[] } };
}

/**
 * Fits the content of a log in what is left of the message and makes a block of text of each piece.
 */
function toContentBlocks(content: LogMessageOptions['content'], available: number): APITextDisplayComponent[] {
	const texts = isLogBlocks(content)
		? fitBlocks(content.blocks, available)
		: fitLogParts(typeof content === 'string' ? [content] : content, available).flatMap((part) => splitContent(part));
	return texts.map((text): APITextDisplayComponent => ({ type: ComponentType.TextDisplay, content: text }));
}

function isLogBlocks(content: LogMessageOptions['content']): content is LogBlocks {
	return typeof content === 'object' && !Array.isArray(content) && 'blocks' in content;
}

/**
 * Takes the blocks that fit whole in what is left of the message. The first one that does not fit is left out with the
 * ones after it: cutting it is what the caller gave the blocks to avoid.
 */
function fitBlocks(blocks: readonly string[], available: number): string[] {
	const fitting: string[] = [];
	let length = 0;
	for (const block of blocks) {
		if (block.length === 0) continue;

		length += block.length;
		if (length > available) break;
		fitting.push(block);
	}

	return fitting;
}

/**
 * Cuts the parts of a log so that all of them fit in the characters the message has left.
 *
 * @remarks
 *
 * The parts that fit in an even share of what is left are kept whole, and the rest is shared between the ones that do
 * not: two texts of 100 and 5000 characters in a budget of 3000 give 100 and 2900.
 *
 * @param parts - The parts to fit.
 * @param budget - The most characters all of them can hold together.
 */
export function fitLogParts(parts: readonly string[], budget: number): string[] {
	const limits = Array.from<number>({ length: parts.length }).fill(0);
	let remaining = Math.max(0, budget);

	// The shortest first, so that what they do not use is left to the longer ones:
	const order = parts.map((part, index) => ({ length: part.length, index })).sort((left, right) => left.length - right.length);
	for (const [position, { length, index }] of order.entries()) {
		const limit = Math.min(length, Math.floor(remaining / (order.length - position)));
		limits[index] = limit;
		remaining -= limit;
	}

	return parts.map((part, index) => part.slice(0, limits[index]));
}

/**
 * Splits a text in blocks, at a line break or a space when there is one near the end of a block.
 */
function splitContent(content: string): string[] {
	if (content.length === 0) return [];

	const blocks: string[] = [];
	let rest = content;
	while (rest.length > MaximumBlockLength) {
		const slice = rest.slice(0, MaximumBlockLength);
		let index = slice.lastIndexOf('\n');
		if (index === -1) index = slice.lastIndexOf(' ');

		// The separator is left out; a block with none is cut as it is, so no character is lost:
		if (index === -1) {
			blocks.push(slice);
			rest = rest.slice(MaximumBlockLength);
		} else {
			blocks.push(rest.slice(0, index).trim());
			rest = rest.slice(index + 1);
		}
	}

	if (rest.trim().length > 0) blocks.push(rest.trim());
	return blocks;
}
