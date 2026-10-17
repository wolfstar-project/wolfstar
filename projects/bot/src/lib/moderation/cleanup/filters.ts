import { urlRegex } from '#utils/Links/UrlRegex';
import { getImageUrl } from '#utils/util';
import type { AutoDelete, CleanupFilterKind } from 'wolfstar-database';

/**
 * What the filters read of a message, which the messages of the gateway have.
 */
export interface CleanupMessage {
	content: string;
	author: { id: string; bot: boolean };
	attachments: Iterable<{ url: string }> | { values(): Iterable<{ url: string }> };
	embeds: readonly unknown[];
}

const InviteRegExp = /(?:discord\.(?:gg|io|me|plus|link)|invite\.(?:gg|ink)|discord(?:app)?\.com\/invite)\/(?:[\w-]{2,})/i;
const MentionRegExp = /<(?:@[!&]?|#)\d{17,20}>|@everyone|@here/;

function getAttachments(message: CleanupMessage): { url: string }[] {
	const { attachments } = message;
	return [...('values' in attachments ? attachments.values() : attachments)];
}

/**
 * Whether a message is what a filter looks for, see `CleanupFilterKinds`.
 *
 * @remarks The mentions are read in the text, since the gateway only resolves the ones it has in the cache.
 *
 * @param message - The message to check.
 * @param kind - The filter.
 * @param value - The user ID or the text of the filters that have one, compared whatever the case.
 */
export function matchesCleanupFilter(message: CleanupMessage, kind: CleanupFilterKind, value: string | null = null): boolean {
	const content = message.content.toLowerCase();
	const text = (value ?? '').toLowerCase();

	switch (kind) {
		case 'any':
			return true;
		case 'user':
			return message.author.id === value;
		case 'contains':
			return text.length > 0 && content.includes(text);
		case 'notContains':
			return text.length > 0 && !content.includes(text);
		case 'startsWith':
			return text.length > 0 && content.startsWith(text);
		case 'endsWith':
			return text.length > 0 && content.endsWith(text);
		case 'links':
			// The regular expression is made each time, a global one keeps the index of its last match:
			return urlRegex({ requireProtocol: true, tlds: true }).test(message.content);
		case 'invites':
			return InviteRegExp.test(message.content);
		case 'images':
			return getAttachments(message).some((attachment) => getImageUrl(attachment.url) !== undefined);
		case 'mentions':
			return MentionRegExp.test(message.content);
		case 'embeds':
			return message.embeds.length > 0;
		case 'bots':
			return message.author.bot;
		case 'humans':
			return !message.author.bot;
		case 'text':
			return message.content.trim().length > 0 && getAttachments(message).length === 0;
	}
}

/**
 * Whether the automatic deletion of a channel deletes a message: the messages of bots are kept unless it deletes them
 * too, and so are the ones that match something it allows.
 *
 * @param message - The message that was sent in the channel.
 * @param config - The automatic deletion of the channel.
 */
export function shouldAutoDelete(message: CleanupMessage, config: Pick<AutoDelete, 'allow' | 'bots'>): boolean {
	if (message.author.bot && !config.bots) return false;
	return !config.allow.some((kind) => matchesCleanupFilter(message, kind));
}
