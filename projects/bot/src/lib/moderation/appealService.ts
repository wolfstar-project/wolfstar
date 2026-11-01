import { readSettings } from '#lib/database/settings/functions';
import { ModerationActions } from '#lib/moderation/actions';
import { AppealableTypes, encodeAppealId, findAppealableCases, getAppealUndoActionName, type AppealableType } from '#lib/moderation/appeals';
import { fetchGuildT, getTitle } from '#lib/moderation/common/util';
import type { ModerationManager } from '#lib/moderation/managers/ModerationManager';
import type { TranslationKey } from '#lib/structures/commands/utils';
import { getModeration } from '#utils/functions';
import { Colors } from '#utils/constants';
import { EmbedBuilder } from '@discordjs/builders';
import { messageLink, time, TimestampStyles, userMention } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { canSendEmbeds } from '@wolfstar/http-framework-utilities/gateway';
import type { Guild } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import {
	ButtonStyle,
	ComponentType,
	ThreadAutoArchiveDuration,
	type APIActionRowComponent,
	type APIButtonComponent,
	type Snowflake
} from 'discord-api-types/v10';
import {
	createAppeal,
	decideAppeal,
	fetchAppeal,
	fetchUserAppeals,
	MaximumAppealAnswerLength,
	MaximumAppealQuestions,
	reopenAppeal,
	setAppealMessage,
	type Appeal,
	type AppealStatus
} from 'wolfstar-database';

/**
 * The questions of the form of a guild, the default one when it set none.
 */
export function getAppealQuestions(t: TFunction<AnyNamespace>, questions: readonly string[]): string[] {
	const set = questions.map((question) => question.trim()).filter((question) => question !== '');
	return set.length === 0 ? [t('moderation:appealDefaultQuestion')] : set.slice(0, MaximumAppealQuestions);
}

/**
 * Checks the answers of a form: one per question, each written and not too long.
 *
 * @returns The answers, trimmed, or `null` when they are not valid.
 */
export function parseAppealAnswers(answers: unknown, questions: number): string[] | null {
	if (!Array.isArray(answers) || answers.length !== questions) return null;

	const parsed: string[] = [];
	for (const answer of answers) {
		if (typeof answer !== 'string') return null;
		const trimmed = answer.trim();
		if (trimmed === '' || trimmed.length > MaximumAppealAnswerLength) return null;
		parsed.push(trimmed);
	}

	return parsed;
}

/**
 * The cases of a member they can appeal in a guild, with the appeal they already made of each, for the page of the
 * website.
 */
export async function getAppealPage(guild: Guild, userId: Snowflake) {
	const settings = await readSettings(guild.id);
	const t = await fetchGuildT(guild);
	const moderation = await getModeration(guild);
	const entries = await moderation.fetch({ userId });
	const appeals = await fetchUserAppeals(container.prisma, guild.id, userId);

	return {
		guild: { id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128, extension: 'png' }) },
		enabled: settings.appealsEnabled,
		questions: getAppealQuestions(t, settings.appealsQuestions),
		cases: findAppealableCases(entries.values(), userId, settings).map((entry) => {
			const appeal = appeals.find((item) => item.caseId === entry.id) ?? null;
			return {
				id: entry.id,
				type: getTitle(t, entry),
				reason: entry.reason,
				createdAt: entry.createdAt,
				duration: entry.duration,
				appeal: appeal === null ? null : { status: appeal.status, reason: appeal.reason }
			};
		})
	};
}

export type AppealSubmitError = 'disabled' | 'notAppealable' | 'invalid' | 'appealed';

/**
 * Makes the appeal of a case and sends it to the channel of the moderators.
 *
 * @param guild - The guild.
 * @param userId - The member who appeals, who must be the one of the case.
 * @param caseId - The case.
 * @param answers - The answers to the questions of the form.
 */
export async function submitAppeal(
	guild: Guild,
	userId: Snowflake,
	caseId: number,
	answers: unknown
): Promise<{ appeal: Appeal } | { error: AppealSubmitError }> {
	const settings = await readSettings(guild.id);
	if (!settings.appealsEnabled) {
		container.logger.debug(`[Appeals] ${userId} of ${guild.id} could not appeal the case ${caseId}: appeals are off`);
		return { error: 'disabled' };
	}

	const moderation = await getModeration(guild);
	const entries = await moderation.fetch({ userId });
	const entry = findAppealableCases(entries.values(), userId, settings).find((item) => item.id === caseId);
	if (entry === undefined) {
		container.logger.debug(`[Appeals] ${userId} of ${guild.id} could not appeal the case ${caseId}: it cannot be appealed`);
		return { error: 'notAppealable' };
	}

	const t = await fetchGuildT(guild);
	const questions = getAppealQuestions(t, settings.appealsQuestions);
	const parsed = parseAppealAnswers(answers, questions.length);
	if (parsed === null) return { error: 'invalid' };

	const appeal = await createAppeal(container.prisma, guild.id, { caseId, userId, answers: parsed });
	if (appeal === null) {
		container.logger.debug(`[Appeals] ${userId} of ${guild.id} already appealed the case ${caseId}`);
		return { error: 'appealed' };
	}

	container.logger.debug(`[Appeals] ${userId} of ${guild.id} appealed the case ${caseId}: appeal ${appeal.id}`);
	await sendAppealMessage(guild, settings.appealsChannel, t, appeal, entry, questions).catch((error: unknown) =>
		container.logger.error('[Appeals] Could not send an appeal to the channel of the moderators:', error)
	);
	return { appeal };
}

async function sendAppealMessage(
	guild: Guild,
	channelId: Snowflake | null,
	t: TFunction<AnyNamespace>,
	appeal: Appeal,
	entry: ModerationManager.Entry,
	questions: readonly string[]
) {
	if (channelId === null) {
		container.logger.debug(`[Appeals] The appeal ${appeal.id} of ${guild.id} was not sent: no channel is set`);
		return;
	}

	const channel = await container.gatewayClient.channels.fetch(channelId).catch(() => null);
	if (channel === null || !('send' in channel) || !('guildId' in channel) || channel.guildId !== guild.id || !(await canSendEmbeds(channel))) {
		container.logger.debug(`[Appeals] The appeal ${appeal.id} of ${guild.id} was not sent: the bot cannot post in ${channelId}`);
		return;
	}

	const sent = await channel.send({ ...renderAppealMessage(t, appeal, entry, questions, 'pending'), allowed_mentions: { parse: [] } });
	await setAppealMessage(container.prisma, guild.id, appeal.id, channelId, sent.id);
	container.logger.debug(`[Appeals] The appeal ${appeal.id} of ${guild.id} was sent to ${channelId}: message ${sent.id}`);

	// `/appeal approve` and `/appeal deny` read the message after they decide, and this reads the decision after it saves
	// the message, so one of the two finds the other: a decision made while the message was on its way is not lost on it.
	const current = await fetchAppeal(container.prisma, guild.id, appeal.id);
	if (current !== null && current.status !== 'pending') {
		const decided = renderAppealMessage(t, current, entry, questions, current.status, current.reviewerId, current.reason);
		await container.gatewayClient.api.channels.editMessage(channelId, sent.id, { ...decided, allowed_mentions: { parse: [] } });
	}

	// The moderators talk about the appeal in its thread and `/appeal send` writes to the member from it, which finds the
	// appeal by the ID of the thread: the one of the message it starts from. Without one the appeal is still decided.
	await container.gatewayClient.api.channels
		.createThread(
			channelId,
			{ name: cutText(t('moderation:appealThreadName', { case: entry.id }), 100), auto_archive_duration: ThreadAutoArchiveDuration.OneWeek },
			sent.id
		)
		.catch((error: unknown) => container.logger.warn(`[Appeals] Could not start the thread of the appeal ${appeal.id} of ${guild.id}:`, error));
}

/**
 * The message of an appeal in the channel of the moderators: the case, the answers, and buttons to accept or deny it
 * while it is pending; once decided, what was decided instead of the buttons.
 */
export function renderAppealMessage(
	t: TFunction<AnyNamespace>,
	appeal: Appeal,
	entry: ModerationManager.Entry,
	questions: readonly string[],
	status: AppealStatus,
	reviewerId: Snowflake | null = null,
	reason: string | null = null
) {
	const embed = new EmbedBuilder()
		.setColor(status === 'pending' ? Colors.Yellow : status === 'accepted' ? Colors.Green : Colors.Red)
		.setTitle(cutText(t('moderation:appealTitle', { case: entry.id, type: getTitle(t, entry) }), 256))
		.setDescription(
			cutText(
				[
					t('moderation:appealUser', { user: userMention(appeal.userId) }),
					entry.reason ? t('moderation:appealCaseReason', { reason: entry.reason }) : null,
					t('moderation:appealDate', { time: time(Math.floor(appeal.createdAt / 1000), TimestampStyles.RelativeTime) })
				]
					.filter((line) => line !== null)
					.join('\n'),
				4096
			)
		)
		.addFields(
			appeal.answers.slice(0, 25).map((answer, index) => ({
				name: cutText(questions[index] ?? `#${index + 1}`, 256),
				value: cutText(answer, 1024)
			}))
		);

	if (status !== 'pending') {
		const key = status === 'accepted' ? 'moderation:appealAccepted' : 'moderation:appealDenied';
		embed.setFooter({ text: cutText(t(key, { reason: reason ?? '-' }), 2048) });
		if (reviewerId !== null) embed.addFields({ name: t('moderation:appealReviewer'), value: userMention(reviewerId) });
		return { embeds: [embed.toJSON()], components: [] };
	}

	const button = (verb: 'accept' | 'deny', style: ButtonStyle.Success | ButtonStyle.Danger, label: string): APIButtonComponent => ({
		type: ComponentType.Button,
		custom_id: encodeAppealId({ appealId: appeal.id, verb, submit: false }),
		style,
		label: cutText(label, 80)
	});
	const row: APIActionRowComponent<APIButtonComponent> = {
		type: ComponentType.ActionRow,
		components: [
			button('accept', ButtonStyle.Success, t('moderation:appealAccept')),
			button('deny', ButtonStyle.Danger, t('moderation:appealDeny'))
		]
	};
	return { embeds: [embed.toJSON()], components: [row] };
}

/**
 * What `/appeal view` shows of an appeal: its message, with what was decided, and a link to it when it was sent. The
 * buttons stay on that message, which is the one a decision changes.
 */
export function renderAppealView(t: TFunction<AnyNamespace>, appeal: Appeal, entry: ModerationManager.Entry, questions: readonly string[]) {
	const { embeds } = renderAppealMessage(t, appeal, entry, questions, appeal.status, appeal.reviewerId, appeal.reason);
	if (appeal.channelId === null || appeal.messageId === null) return { embeds, components: [] };

	const row: APIActionRowComponent<APIButtonComponent> = {
		type: ComponentType.ActionRow,
		components: [
			{
				type: ComponentType.Button,
				style: ButtonStyle.Link,
				label: cutText(t('commands/appeal:viewOpen'), 80),
				url: messageLink(appeal.channelId, appeal.messageId, appeal.guildId)
			}
		]
	};
	return { embeds, components: [row] };
}

export type AppealDecisionError = 'decided' | 'undoFailed';

/**
 * Decides an appeal, once: an accepted one undoes its case, in the name of the moderator; when the undo fails the appeal
 * is put back to pending. The member is told what was decided in a direct message.
 */
export async function applyAppealDecision(
	guild: Guild,
	appeal: Appeal,
	entry: { readonly type: AppealableType; readonly id: number },
	accept: boolean,
	reviewerId: Snowflake,
	reason: string | null
): Promise<AppealDecisionError | null> {
	const status = accept ? 'accepted' : 'denied';
	if (!(await decideAppeal(container.prisma, guild.id, appeal.id, status, reviewerId, reason))) {
		container.logger.debug(`[Appeals] The appeal ${appeal.id} of ${guild.id} was already decided`);
		return 'decided';
	}

	container.logger.debug(`[Appeals] The appeal ${appeal.id} of ${guild.id} was decided by ${reviewerId}: ${status}`);

	const t = await fetchGuildT(guild);
	if (accept) {
		try {
			const moderator = await container.gatewayClient.users.fetch(reviewerId);
			const undoReason = t('moderation:appealUndoReason', { case: entry.id, reason: reason ?? '-' });
			await ModerationActions[getAppealUndoActionName(entry.type)].undo(guild, { user: appeal.userId, moderator, reason: undoReason });
		} catch (error) {
			container.logger.error('[Appeals] Could not undo the case of an accepted appeal:', error);
			await reopenAppeal(container.prisma, guild.id, appeal.id);
			return 'undoFailed';
		}
	}

	// A member who does not take direct messages is not told, which is not a failure of the decision:
	const user = await container.gatewayClient.users.fetch(appeal.userId).catch(() => null);
	const key = accept ? 'moderation:appealDmAccepted' : 'moderation:appealDmDenied';
	await user
		?.send({ content: t(key, { guild: guild.name, case: entry.id, reason: reason ?? '-' }), allowed_mentions: { parse: [] } })
		.catch(() => null);
	return null;
}

export type AppealSettleError = AppealDecisionError | 'caseGone';

/**
 * What a moderator is told when an appeal could not be decided.
 */
export const AppealSettleErrorKeys = {
	caseGone: 'moderation:appealCaseGone',
	decided: 'moderation:appealAlreadyDecided',
	undoFailed: 'moderation:appealUndoFailed'
} as const satisfies Record<AppealSettleError, TranslationKey>;

/**
 * Decides an appeal by its case, for the buttons of its message and for `/appeal approve` and `/appeal deny`.
 *
 * @returns Its message as it reads once decided, in the language of the guild as it was sent, or why it was not decided.
 */
export async function settleAppeal(
	guild: Guild,
	appeal: Appeal,
	accept: boolean,
	reviewerId: Snowflake,
	reason: string | null
): Promise<{ message: ReturnType<typeof renderAppealMessage> } | { error: AppealSettleError }> {
	const moderation = await getModeration(guild);
	const entry = await moderation.fetch(appeal.caseId);
	if (entry === null || !(AppealableTypes as readonly number[]).includes(entry.type)) return { error: 'caseGone' };

	const error = await applyAppealDecision(guild, appeal, { id: entry.id, type: entry.type as AppealableType }, accept, reviewerId, reason);
	if (error !== null) return { error };

	const t = await fetchGuildT(guild);
	const settings = await readSettings(guild.id);
	const questions = getAppealQuestions(t, settings.appealsQuestions);
	return { message: renderAppealMessage(t, appeal, entry, questions, accept ? 'accepted' : 'denied', reviewerId, reason) };
}

/**
 * Writes to the member who made an appeal, for `/appeal send`.
 *
 * @returns Whether it reached them: the bot cannot write to who shares no server with it, as a member it banned often
 * does not, nor to who does not take direct messages.
 */
export async function sendAppealDirectMessage(guild: Guild, appeal: Appeal, message: string) {
	const t = await fetchGuildT(guild);
	const content = t('moderation:appealDmMessage', { guild: guild.name, case: appeal.caseId, message });
	const user = await container.gatewayClient.users.fetch(appeal.userId).catch(() => null);
	const sent = await user?.send({ content, allowed_mentions: { parse: [] } }).catch(() => null);

	container.logger.debug(`[Appeals] A message to ${appeal.userId} of ${guild.id}: ${sent ? 'sent' : 'not delivered'}, appeal ${appeal.id}`);
	return Boolean(sent);
}
