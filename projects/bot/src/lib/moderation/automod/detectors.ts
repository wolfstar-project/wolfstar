import { urlRegex } from '#utils/Links/UrlRegex';

/**
 * The longest run of the same character, and of the same word, in a text: `aaaa` is a run of four characters and
 * `no no no` a run of three words. The case and the space between the words do not count.
 */
export function countRepeats(content: string): { characters: number; words: number } {
	let characters = 0;
	let run = 0;
	let previous = '';
	for (const character of content.toLowerCase()) {
		run = character === previous && character.trim().length > 0 ? run + 1 : 1;
		previous = character;
		if (run > characters && character.trim().length > 0) characters = run;
	}

	let words = 0;
	run = 0;
	previous = '';
	for (const word of content.toLowerCase().split(/\s+/)) {
		if (word.length === 0) continue;
		run = word === previous ? run + 1 : 1;
		previous = word;
		if (run > words) words = run;
	}

	return { characters, words };
}

const EmojiRegExp =
	/<a?:\w{2,32}:\d{17,20}>|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*|[\u{1F1E6}-\u{1F1FF}]{2}/gu;

/**
 * How many emojis a text has, the ones of Discord and the ones of Unicode. A sequence (a family, a skin tone, a flag)
 * is one emoji.
 */
export function countEmojis(content: string): number {
	return content.match(EmojiRegExp)?.length ?? 0;
}

/**
 * How many links a text has.
 */
export function countLinks(content: string): number {
	// The regular expression is made each time, a global one keeps the index of its last match:
	return content.match(urlRegex({ requireProtocol: true, tlds: true }))?.length ?? 0;
}

const SpoilerRegExp = /\|\|[^|]+?\|\|/s;

/**
 * Whether a text hides a part of it as a spoiler (`||hidden||`).
 */
export function hasSpoiler(content: string): boolean {
	return SpoilerRegExp.test(content);
}

/**
 * Whether the name of an attachment marks it as a spoiler, which is how Discord stores it.
 */
export function isSpoilerAttachment(name: string | null | undefined): boolean {
	return name?.startsWith('SPOILER_') ?? false;
}

const MaskedLinkRegExp = /\[[^\]\n]+\]\(\s*<?https?:\/\/[^)\s]+>?(?:\s+"[^"]*")?\s*\)/i;

/**
 * Whether a text has a link that is shown as another text (`[text](https://example.com)`).
 */
export function hasMaskedLink(content: string): boolean {
	return MaskedLinkRegExp.test(content);
}

/**
 * Counts what happened lately, by key: the messages of a member, their links, their stickers.
 */
export class WindowCounter {
	readonly #window: number;
	readonly #hits = new Map<string, { at: number; amount: number }[]>();

	/**
	 * @param window - How long a hit counts, in milliseconds.
	 */
	public constructor(window: number) {
		this.#window = window;
	}

	/**
	 * Adds hits to a key.
	 *
	 * @param key - What the hits are of.
	 * @param amount - How many hits to add.
	 * @param now - The time of the hits, in milliseconds.
	 * @returns The hits of the key within the window, the new ones included.
	 */
	public add(key: string, amount: number, now = Date.now()): number {
		// The keys that went quiet are dropped once in a while, so the counter does not grow with every member:
		if (this.#hits.size >= WindowCounter.sweepSize) this.sweep(now);

		const since = now - this.#window;
		const hits = (this.#hits.get(key) ?? []).filter((hit) => hit.at > since);
		hits.push({ at: now, amount });
		this.#hits.set(key, hits);
		return hits.reduce((total, hit) => total + hit.amount, 0);
	}

	/**
	 * Forgets the hits of a key, once they were acted on.
	 */
	public reset(key: string) {
		this.#hits.delete(key);
	}

	private sweep(now: number) {
		const since = now - this.#window;
		for (const [key, hits] of this.#hits) {
			if (hits.every((hit) => hit.at <= since)) this.#hits.delete(key);
		}
	}

	private static readonly sweepSize = 1000;
}
