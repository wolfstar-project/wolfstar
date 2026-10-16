import { readSettings } from '#lib/database/settings/functions';
import { ModerationActions } from '#lib/moderation/actions';
import { encodeAppealId, findAppealableCases, getAppealUndoActionName, type AppealableType } from '#lib/moderation/appeals';
import { fetchGuildT, getTitle } from '#lib/moderation/common/util';
import type { ModerationManager } from '#lib/moderation/managers/ModerationManager';
import { getModeration } from '#utils/functions';
import { Colors } from '#utils/constants';
import { EmbedBuilder } from '@discordjs/builders';
import { time, TimestampStyles, userMention } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { canSendEmbeds } from '@wolfstar/http-framework-utilities/gateway';
import type { Guild } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import { ButtonStyle, ComponentType, type APIActionRowComponent, type APIButtonComponent, type Snowflake } from 'discord-api-types/v10';
import {
	createAppeal,
	decideAppeal,
	fetchUserAppeals,
	MaximumAppealAnswerLength,
	MaximumAppealQuestions,
	reopenAppeal,
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
	if (!settings.appealsEnabled) return { error: 'disabled' };

	const moderation = await getModeration(guild);
	const entries = await moderation.fetch({ userId });
	const entry = findAppealableCases(entries.values(), userId, settings).find((item) => item.id === caseId);
	if (entry === undefined) return { error: 'notAppealable' };

	const t = await fetchGuildT(guild);
	const questions = getAppealQuestions(t, settings.appealsQuestions);
	const parsed = parseAppealAnswers(answers, questions.length);
	if (parsed === null) return { error: 'invalid' };

	const appeal = await createAppeal(container.prisma, guild.id, { caseId, userId, answers: parsed });
	if (appeal === null) return { error: 'appealed' };

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
	if (channelId === null) return;

	const channel = await container.gatewayClient.channels.fetch(channelId).catch(() => null);
	if (channel === null || !('send' in channel) || !('guildId' in channel) || channel.guildId !== guild.id) return;
	if (!(await canSendEmbeds(channel))) return;

	await channel.send({ ...renderAppealMessage(t, appeal, entry, questions, 'pending'), allowed_mentions: { parse: [] } });
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

	const button = (verb: 'accept' | 'deny', style: ButtonStyle, label: string): APIButtonComponent => ({
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
	if (!(await decideAppeal(container.prisma, guild.id, appeal.id, status, reviewerId, reason))) return 'decided';

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
