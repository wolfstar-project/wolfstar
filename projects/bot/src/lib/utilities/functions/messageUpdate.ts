import type { Translator } from '#lib/structures/commands/utils';
import { escapeMarkdown } from '#utils/External/escapeMarkdown';
import { bold, strikethrough } from '@discordjs/formatters';
import { isNullishOrEmpty } from '@sapphire/utilities';
import { diffWordsWithSpace } from 'diff';
import type { MessageUpdateStyle } from 'wolfstar-database';

/**
 * Shows the change of an edited message as one text, with what was removed struck through and what was added in bold.
 *
 * @param old - The content before the edit.
 * @param current - The content after the edit.
 */
export function getMessageDifference(old: string, current: string): string {
	const oldEmpty = isNullishOrEmpty(old);
	const currentEmpty = isNullishOrEmpty(current);

	// If both are empty, return an empty string
	if (oldEmpty && currentEmpty) return '';
	// If it went from empty to not empty, return the current bolded
	if (oldEmpty && !currentEmpty) return bold(current);
	// If it went from not empty to empty, return the old strikethrough
	if (!oldEmpty && currentEmpty) return strikethrough(old);
	// If both are not empty, return the difference
	return (
		diffWordsWithSpace(escapeMarkdown(old), escapeMarkdown(current))
			.map((result) => (result.added ? bold(result.value) : result.removed ? strikethrough(result.value) : result.value))
			// The fragments hold the spaces of the text, joining them with another one would double each:
			.join('')
	);
}

/**
 * Shows the content before and the content after an edit as two parts, each one under its own title. The contents are
 * escaped, since a message full of Markdown of its own would otherwise be shown formatted, not as it was written.
 *
 * @param t - The function to translate with.
 * @param old - The content before the edit.
 * @param current - The content after the edit.
 */
export function getMessageSeparate(t: Translator, old: string, current: string): [before: string, after: string] {
	const part = (title: 'events/messages:messageUpdateBefore' | 'events/messages:messageUpdateAfter', content: string) =>
		`${bold(t(title))}\n${isNullishOrEmpty(content) ? t('events/messages:messageUpdateEmpty') : escapeMarkdown(content)}`;

	return [part('events/messages:messageUpdateBefore', old), part('events/messages:messageUpdateAfter', current)];
}

/**
 * Builds the content of the log of an edited message for the style the server chose.
 *
 * @param style - How the server wants the change shown.
 * @param t - The function to translate with.
 * @param old - The content before the edit.
 * @param current - The content after the edit.
 */
export function getMessageUpdateContent(style: MessageUpdateStyle, t: Translator, old: string, current: string): string | string[] {
	return style === 'Separate' ? getMessageSeparate(t, old, current) : getMessageDifference(old, current);
}
