import type { APIUser } from 'discord-api-types/v10';
import {
	ComponentType,
	MessageFlags,
	type AllowedMentionsTypes,
	type APIContainerComponent,
	type APIMessageTopLevelComponent,
	type APITextDisplayComponent
} from 'discord-api-types/v10';
import { getDisplayAvatar, getFullEmbedAuthor } from '#utils/util';
import { time, TimestampStyles } from '@discordjs/formatters';

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
	 * ({@linkcode fitLogParts}).
	 */
	content: string | readonly string[];

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
 * {@linkcode MaximumLogMessageLength}.
 *
 * @param options - What the message is made of.
 */
export function createLogMessage(options: LogMessageOptions) {
	const header = `**${getFullEmbedAuthor(options.author as APIUser).name}**`;
	const footer = `-# ${options.footer} • ${time(options.timestamp ?? new Date(), TimestampStyles.ShortDateTime)}`;

	// The header and the footer count against the limit too:
	const available = Math.max(0, MaximumLogMessageLength - header.length - footer.length);
	const parts = typeof options.content === 'string' ? [options.content] : options.content;
	const blocks = fitLogParts(parts, available)
		.flatMap((part) => splitContent(part))
		.map((content): APITextDisplayComponent => ({
			type: ComponentType.TextDisplay,
			content
		}));

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
		if (index === -1) index = MaximumBlockLength;

		blocks.push(rest.slice(0, index).trim());
		rest = rest.slice(index + 1);
	}

	if (rest.trim().length > 0) blocks.push(rest.trim());
	return blocks;
}
