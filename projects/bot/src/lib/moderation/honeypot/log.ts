import { Colors } from '#utils/constants';
import { createLogMessage, type LogMessageOptions } from '#utils/functions';
import { channelMention, codeBlock, userMention } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import type { Snowflake } from 'discord-api-types/v10';
import type { HoneypotAction } from 'wolfstar-database';

/**
 * The most of what was sent in the honeypot channel that its log quotes.
 */
const MaximumQuotedLength = 1500;

/**
 * A member the honeypot caught, and what became of them.
 */
export interface HoneypotCatch {
	/**
	 * What the guild does to who writes in its honeypot channel.
	 */
	action: HoneypotAction;

	/**
	 * Who wrote in the channel.
	 */
	user: LogMessageOptions['author'];
	channelId: Snowflake;

	/**
	 * The text of the message, empty when it only had attachments.
	 */
	content: string;

	/**
	 * How many attachments the message had.
	 */
	attachments: number;

	/**
	 * The case the action made, or `null` when the action could not be taken.
	 */
	caseId: number | null;

	/**
	 * Why the action could not be taken, when Discord said why.
	 */
	error?: string;
}

/**
 * Builds the message that reports a catch of the honeypot to the channel the guild set for it: who wrote in the
 * channel, what was done to them and the case it made, or why nothing could be done, and what they sent.
 *
 * @remarks What was sent is quoted in a code block, so a link of a scam cannot be followed from the log.
 *
 * @param t - The function to translate with, in the language of the guild.
 * @param caught - Who was caught, and what became of them.
 */
export function renderHoneypotLog(t: TFunction<AnyNamespace>, caught: HoneypotCatch) {
	const values = {
		user: `${userMention(caught.user.id)} (${caught.user.id})`,
		channel: channelMention(caught.channelId),
		action: t(`serializers:honeypotAction${caught.action}`)
	};

	const lines: string[] = [
		caught.caseId === null
			? t('events/moderation:honeypotLogFailed', { ...values, error: caught.error ?? t('events/moderation:honeypotLogUnknownError') })
			: t('events/moderation:honeypotLogCaught', { ...values, caseId: caught.caseId })
	];
	if (caught.attachments > 0) lines.push(t('events/moderation:honeypotLogAttachments', { count: caught.attachments }));
	if (caught.content.length > 0) lines.push(codeBlock(cutText(caught.content.replaceAll('```', "'''"), MaximumQuotedLength)));

	return createLogMessage({
		color: caught.caseId === null ? Colors.Amber : Colors.Red,
		author: caught.user,
		content: lines.join('\n'),
		footer: t('events/moderation:honeypotLogFooter')
	});
}
