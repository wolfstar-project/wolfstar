import { cutText } from '@sapphire/utilities';
import { MaximumAutoModerationRuleResponseLength } from 'wolfstar-database';

/**
 * What the placeholders of the custom response of a rule are replaced with.
 */
export interface AutoModerationResponseValues {
	/** The mention of the member who infringed the rule. */
	user: string;
	/** The name of the rule. */
	rule: string;
	/** The mention of the channel the message was sent in. */
	channel: string;
}

/**
 * The placeholders a custom response takes, written as `{user}`, whatever their case.
 */
const AutoModerationResponsePlaceholders = ['user', 'rule', 'channel'] as const satisfies readonly (keyof AutoModerationResponseValues)[];

/**
 * Writes the custom response of a rule: `{user}`, `{rule}` and `{channel}` are replaced, anything else is sent as it
 * was written, Markdown and custom emojis included, since it is plain text. The message pings nobody whatever it says:
 * the alerts are sent with no allowed mentions.
 *
 * @param template - The response as the server wrote it.
 * @param values - What the placeholders stand for.
 */
export function formatAutoModerationResponse(template: string, values: AutoModerationResponseValues): string {
	const content = template.replaceAll(/\{(\w+)\}/g, (match, name: string) => {
		const key = name.toLowerCase() as keyof AutoModerationResponseValues;
		return AutoModerationResponsePlaceholders.includes(key) ? values[key] : match;
	});
	// A placeholder may be longer than its name, so the result is cut as the response itself is:
	return cutText(content, MaximumAutoModerationRuleResponseLength + 100);
}

/**
 * Reads a custom response as it was written in a modal or an option: the spaces around are dropped, and an empty text,
 * or `none`, is no response, so the alert says the line of the type again.
 *
 * @returns The response to store, or `undefined` when it is longer than a response can be.
 */
export function parseAutoModerationResponse(input: string): string | null | undefined {
	const trimmed = input.trim();
	if (trimmed.length === 0 || trimmed.toLowerCase() === 'none') return null;
	return trimmed.length > MaximumAutoModerationRuleResponseLength ? undefined : trimmed;
}
