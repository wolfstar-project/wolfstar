import { resolveOnErrorCodes } from '#common';
import { readSettings } from '#lib/database/settings/functions';
import { ModerationActions } from '#lib/moderation/actions';
import { getAppealFormAccess, getBuiltInAppealForm, parseAppealAnswers, type AppealFormLock } from '#lib/moderation/appealForms';
import { AppealableTypes, encodeAppealId, findAppealableCases, getAppealUndoActionName, type AppealableType } from '#lib/moderation/appeals';
import { fetchGuildT, getTitle } from '#lib/moderation/common/util';
import type { ModerationManager } from '#lib/moderation/managers/ModerationManager';
import type { TranslationKey } from '#lib/structures/commands/utils';
import { getModeration } from '#utils/functions';
import { withSharedLock } from '#utils/locks';
import { Colors, Urls } from '#utils/constants';
import { EmbedBuilder } from '@discordjs/builders';
import { hyperlink, messageLink, roleMention, time, TimestampStyles, userMention } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { canSendEmbeds } from '@wolfstar/http-framework-utilities/gateway';
import type { Guild } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import {
	ButtonStyle,
	ChannelType,
	ComponentType,
	MessageFlags,
	RESTJSONErrorCodes,
	ThreadAutoArchiveDuration,
	type APIActionRowComponent,
	type APIButtonComponent,
	type Snowflake
} from 'discord-api-types/v10';
import {
	createAppeal,
	createAppealBlock,
	decideAppeal,
	fetchAppeal,
	fetchAppealBlock,
	fetchAppealForm,
	fetchAppealForms,
	fetchUserAppeals,
	forgetAppealFormRole,
	reopenAppeal,
	setAppealMessage,
	setAppealThread,
	type Appeal,
	type AppealAnswer,
	type AppealForm,
	type AppealStatus,
	type ReadonlyGuildData
} from 'wolfstar-database';

/**
 * The forms a page offers: the ones of the guild, or the built-in one when it set none up. A guild whose forms are all
 * disabled closed its appeals, and the built-in form must not open them again.
 */
async function readAppealForms(t: TFunction<AnyNamespace>, guildId: Snowflake) {
	const forms = await fetchAppealForms(container.prisma, guildId);
	return forms.length === 0 ? [getBuiltInAppealForm(t, guildId)] : forms;
}

/**
 * What the forms of a guild depend on for a user, see `getAppealFormAccess`.
 */
async function readAppealContext(guild: Guild, userId: Snowflake, settings: ReadonlyGuildData) {
	const moderation = await getModeration(guild);
	const entries = await moderation.fetch({ userId });
	const appeals = await fetchUserAppeals(container.prisma, guild.id, userId);
	// Only an unknown member is not one: anything else passing for it would let a restricted role through.
	const member = await resolveOnErrorCodes(container.gatewayClient.members.fetch(guild.id, userId), RESTJSONErrorCodes.UnknownMember);

	return {
		settings,
		appeals,
		now: Date.now(),
		// A user who is not a member has no roles to read, a banned one is not:
		roles: member?.roleIds ?? null,
		cases: findAppealableCases(entries.values(), userId, settings)
	};
}

/**
 * What a user can do with the appeals of a guild, for the page of the website: whether they are on, the block of the
 * user, the forms, each open with its cases or locked with why, and the appeals the user already sent.
 */
export async function getAppealPage(guild: Guild, userId: Snowflake) {
	const settings = await readSettings(guild.id);
	const t = await fetchGuildT(guild);
	const context = await readAppealContext(guild, userId, settings);

	const page = {
		guild: { id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128, extension: 'png' }) },
		enabled: settings.appealsEnabled,
		block: null as { reason: string | null } | null,
		forms: [] as AppealPageForm[],
		appeals: [...context.appeals]
			.sort((a, b) => b.createdAt - a.createdAt)
			.map((appeal) => ({
				caseId: appeal.caseId,
				formId: appeal.formId,
				status: appeal.status,
				reason: appeal.reason,
				reviewerId: settings.appealsAnonymous ? null : appeal.reviewerId,
				createdAt: appeal.createdAt
			}))
	};
	if (!settings.appealsEnabled) return page;

	const block = await fetchAppealBlock(container.prisma, guild.id, userId);
	if (block !== null) return { ...page, block: { reason: block.reason } };

	const forms = await readAppealForms(t, guild.id);
	return {
		...page,
		forms: forms.map((form): AppealPageForm => {
			const access = getAppealFormAccess({ ...context, form });
			const { id, name, description, icon, questions, lockReason } = form;
			return {
				id,
				name,
				description,
				icon,
				questions,
				lockReason: access.open ? null : lockReason,
				lock: access.open ? null : access.lock,
				until: !access.open && access.lock === 'cooldown' ? access.until : null,
				cases: access.open
					? access.cases.map((entry) => ({
							id: entry.id,
							type: getTitle(t, entry),
							reason: entry.reason,
							createdAt: entry.createdAt,
							duration: entry.duration
						}))
					: []
			};
		})
	};
}

/**
 * A form on the page of the website.
 */
export interface AppealPageForm extends Pick<AppealForm, 'id' | 'name' | 'description' | 'icon' | 'questions' | 'lockReason'> {
	lock: AppealFormLock | null;
	/**
	 * When a `cooldown` ends, in milliseconds.
	 */
	until: number | null;
	cases: { id: number; type: string; reason: string | null; createdAt: number; duration: number | null }[];
}

export type AppealSubmitError = 'disabled' | 'blocked' | 'notFound' | 'locked' | 'notAppealable' | 'invalid' | 'appealed';

/**
 * Makes the appeal of a case with a form and sends it to the channel of the staff. It asks everything the page asked
 * again: the page may be old.
 *
 * @param guild - The guild.
 * @param userId - The user who appeals, who must be the one of the case.
 * @param formId - The form, `null` for the built-in one.
 * @param caseId - The case.
 * @param raw - What was sent, keyed by the ID of each question.
 */
export async function submitAppeal(
	guild: Guild,
	userId: Snowflake,
	formId: string | null,
	caseId: number,
	raw: unknown
): Promise<{ appeal: Appeal } | { error: AppealSubmitError }> {
	const settings = await readSettings(guild.id);
	if (!settings.appealsEnabled) {
		container.logger.debug(`[Appeals] ${userId} of ${guild.id} could not appeal the case ${caseId}: appeals are off`);
		return { error: 'disabled' };
	}

	if ((await fetchAppealBlock(container.prisma, guild.id, userId)) !== null) {
		container.logger.debug(`[Appeals] ${userId} of ${guild.id} could not appeal the case ${caseId}: they are blocked`);
		return { error: 'blocked' };
	}

	const t = await fetchGuildT(guild);
	const form =
		formId === null
			? (await readAppealForms(t, guild.id)).find((item) => item.id === null)
			: await fetchAppealForm(container.prisma, guild.id, formId);
	if (form === undefined || form === null) return { error: 'notFound' };

	// What it reads decides whether it can write, so two submissions of a user wait for each other: `appeals.max-active`
	// would let both through.
	const created = await withSharedLock<{ error: AppealSubmitError } | { appeal: Appeal; entry: ModerationManager.Entry }>(
		`appeals:${guild.id}:${userId}`,
		async () => {
			const access = getAppealFormAccess({ ...(await readAppealContext(guild, userId, settings)), form });
			if (!access.open) {
				container.logger.debug(`[Appeals] ${userId} of ${guild.id} could not use the form ${formId}: ${access.lock}`);
				return { error: 'locked' };
			}

			const entry = access.cases.find((item) => item.id === caseId);
			if (entry === undefined) {
				container.logger.debug(`[Appeals] ${userId} of ${guild.id} could not appeal the case ${caseId}: it cannot be appealed`);
				return { error: 'notAppealable' };
			}

			const answers = parseAppealAnswers(form, raw, { guildId: guild.id, userId });
			if (answers === null) return { error: 'invalid' };

			const appeal = await createAppeal(container.prisma, guild.id, { caseId, userId, formId, answers });
			if (appeal === null) {
				container.logger.debug(`[Appeals] ${userId} of ${guild.id} already appealed the case ${caseId}`);
				return { error: 'appealed' };
			}

			return { appeal, entry };
		}
	);
	if ('error' in created) return created;

	const { appeal, entry } = created;
	container.logger.debug(`[Appeals] ${userId} of ${guild.id} appealed the case ${caseId}: appeal ${appeal.id}`);
	await sendAppealMessage(guild, settings, t, appeal, entry).catch((error: unknown) =>
		container.logger.error('[Appeals] Could not send an appeal to the channel of the moderators:', error)
	);
	return { appeal };
}

async function sendAppealMessage(
	guild: Guild,
	settings: ReadonlyGuildData,
	t: TFunction<AnyNamespace>,
	appeal: Appeal,
	entry: ModerationManager.Entry
) {
	const channelId = settings.appealsChannel;
	if (channelId === null) {
		container.logger.debug(`[Appeals] The appeal ${appeal.id} of ${guild.id} was not sent: no channel is set`);
		return;
	}

	const channel = await container.gatewayClient.channels.fetch(channelId).catch(() => null);
	if (channel === null || !('send' in channel) || !('guildId' in channel) || channel.guildId !== guild.id || !(await canSendEmbeds(channel))) {
		container.logger.debug(`[Appeals] The appeal ${appeal.id} of ${guild.id} was not sent: the bot cannot post in ${channelId}`);
		return;
	}

	const pings = settings.appealsPingRoles;
	const sent = await channel.send({
		...renderAppealMessage(t, appeal, entry, 'pending'),
		content: pings.map((role) => roleMention(role)).join(' '),
		allowed_mentions: { roles: [...pings] }
	});
	await setAppealMessage(container.prisma, guild.id, appeal.id, channelId, sent.id);
	container.logger.debug(`[Appeals] The appeal ${appeal.id} of ${guild.id} was sent to ${channelId}: message ${sent.id}`);

	// `/appeal approve` and `/appeal deny` read the message after they decide, and this reads the decision after it saves
	// the message, so one of the two finds the other: a decision made while the message was on its way is not lost on it.
	const current = await fetchAppeal(container.prisma, guild.id, appeal.id);
	if (current !== null && current.status !== 'pending') {
		const decided = renderAppealMessage(t, current, entry, current.status, current.reviewerId, current.reason);
		await container.gatewayClient.api.channels
			.editMessage(channelId, sent.id, { ...decided, allowed_mentions: { parse: [] } })
			.catch((error: unknown) => container.logger.warn(`[Appeals] Could not update the message of the appeal ${appeal.id}:`, error));
	}

	// The staff talks about the appeal in its thread and `/appeal send` writes to the member from it. Without one the
	// appeal is still decided:
	await startAppealThread(settings, t, appeal, entry.id, channel.type, channelId, sent.id).catch((error: unknown) =>
		container.logger.warn(`[Appeals] Could not start the thread of the appeal ${appeal.id} of ${guild.id}:`, error)
	);
}

/**
 * Starts the thread of an appeal as `appeals.thread` says: a public one on its message, or a private one in its channel,
 * since Discord starts none on a message. That one links to the appeal, and mentioning the staff brings them in. With
 * nobody to bring in nobody would read it, and an announcement channel has none, so those get a public one: the channel
 * is the staff's anyway.
 */
async function startAppealThread(
	settings: ReadonlyGuildData,
	t: TFunction<AnyNamespace>,
	appeal: Appeal,
	caseId: number,
	channelType: ChannelType,
	channelId: Snowflake,
	messageId: Snowflake
) {
	if (settings.appealsThread === 'none') return;

	const staff = [...new Set([...settings.appealsPingRoles, ...settings.appealsManagerRoles])];
	const isPrivate = settings.appealsThread === 'private' && staff.length > 0 && channelType === ChannelType.GuildText;

	const { channels } = container.gatewayClient.api;
	const name = cutText(t('moderation:appealThreadName', { case: caseId }), 100);
	const body = { name, auto_archive_duration: ThreadAutoArchiveDuration.OneWeek };
	const thread = isPrivate
		? await channels.createThread(channelId, { ...body, type: ChannelType.PrivateThread, invitable: false }, undefined)
		: await channels.createThread(channelId, body, messageId);
	await setAppealThread(container.prisma, appeal.guildId, appeal.id, thread.id);

	if (isPrivate) {
		const link = messageLink(channelId, messageId, appeal.guildId);
		const content = [link, ...staff.map((role) => roleMention(role))].join(' ');
		const posted = await channels.createMessage(thread.id, { content, allowed_mentions: { roles: staff } });
		if (((posted.flags ?? 0) & MessageFlags.FailedToMentionSomeRolesInThread) !== 0) {
			container.logger.warn(`[Appeals] Discord could not bring every role into the thread of the appeal ${appeal.id}: too many members`);
		}
	}
}

// An embed holds 6000 characters in all, past which Discord refuses the message and the staff never sees the appeal:
const MaximumAnswersLength = 4250;
const MaximumCaseReasonLength = 400;
const MaximumFileNameLength = 60;

/**
 * The page of the website that serves a file of an appeal, to the member who sent it and the staff.
 *
 * @param index - Its position among the files of the appeal, in the order of its answers.
 */
export function getAppealFileUrl(guildId: Snowflake, appealId: string, index: number) {
	return `${Urls.Website}/appeal-files/${guildId}/${appealId}/${index}`;
}

/**
 * Writes the answers of an appeal as fields. A name of a file is the member's, so what could close its link goes.
 */
function renderAppealAnswers(appeal: Appeal) {
	let files = 0;
	const render = (answer: AppealAnswer) => {
		switch (answer.kind) {
			case 'text':
				return answer.value;
			case 'choice':
				return answer.value.join(', ');
			case 'attachment':
				return answer.value
					.map((file) =>
						hyperlink(
							cutText(file.name.replaceAll(/[[\]()]/g, ''), MaximumFileNameLength),
							getAppealFileUrl(appeal.guildId, appeal.id, files++)
						)
					)
					.join('\n');
		}
	};

	// Four answers fit whole, five share what is left: the rest of a long one is on the dashboard.
	const fieldLength = Math.min(1000, Math.floor(MaximumAnswersLength / Math.max(1, appeal.answers.length)));
	return appeal.answers.slice(0, 25).map((answer) => ({ name: cutText(answer.label, 256), value: cutText(render(answer), fieldLength) }));
}

/**
 * The message of an appeal in the channel of the moderators: the case, the answers, and buttons to accept or deny it
 * while it is pending; once decided, what was decided instead of the buttons.
 */
export function renderAppealMessage(
	t: TFunction<AnyNamespace>,
	appeal: Appeal,
	entry: ModerationManager.Entry | null,
	status: AppealStatus,
	reviewerId: Snowflake | null = null,
	reason: string | null = null
) {
	const embed = new EmbedBuilder()
		.setColor(status === 'pending' ? Colors.Yellow : status === 'accepted' ? Colors.Green : Colors.Red)
		.setTitle(
			cutText(
				t('moderation:appealTitle', { case: appeal.caseId, type: entry === null ? t('commands/appeal:caseGone') : getTitle(t, entry) }),
				256
			)
		)
		.setDescription(
			cutText(
				[
					t('moderation:appealUser', { user: userMention(appeal.userId) }),
					entry?.reason ? t('moderation:appealCaseReason', { reason: cutText(entry.reason, MaximumCaseReasonLength) }) : null,
					t('moderation:appealDate', { time: time(Math.floor(appeal.createdAt / 1000), TimestampStyles.RelativeTime) })
				]
					.filter((line) => line !== null)
					.join('\n'),
				4096
			)
		)
		.addFields(renderAppealAnswers(appeal));

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
 * What `/appeal view` shows of an appeal: its message, with the form and what was decided, and a link to it when it was
 * sent. The buttons stay on that message, which is the one a decision changes.
 */
export function renderAppealView(t: TFunction<AnyNamespace>, appeal: Appeal, entry: ModerationManager.Entry | null, form: string | null = null) {
	const message = renderAppealMessage(t, appeal, entry, appeal.status, appeal.reviewerId, appeal.reason);
	const embeds = form === null ? message.embeds : [{ ...message.embeds[0], author: { name: cutText(form, 256) } }];
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
	undo: AppealableType | null,
	accept: boolean,
	reviewerId: Snowflake,
	reason: string | null
): Promise<{ error: AppealDecisionError } | { delivered: boolean }> {
	const status = accept ? 'accepted' : 'denied';
	if (!(await decideAppeal(container.prisma, guild.id, appeal.id, status, reviewerId, reason))) {
		container.logger.debug(`[Appeals] The appeal ${appeal.id} of ${guild.id} was already decided`);
		return { error: 'decided' };
	}

	container.logger.debug(`[Appeals] The appeal ${appeal.id} of ${guild.id} was decided by ${reviewerId}: ${status}`);

	const t = await fetchGuildT(guild);
	if (accept && undo !== null) {
		try {
			const moderator = await container.gatewayClient.users.fetch(reviewerId);
			const undoReason = t('moderation:appealUndoReason', { case: appeal.caseId, reason: reason ?? '-' });
			await ModerationActions[getAppealUndoActionName(undo)].undo(
				guild,
				{ user: appeal.userId, moderator, reason: undoReason },
				{ ignoreMissing: true }
			);
		} catch (error) {
			container.logger.error('[Appeals] Could not undo the case of an accepted appeal:', error);
			await reopenAppeal(container.prisma, guild.id, appeal.id);
			return { error: 'undoFailed' };
		}
	}

	const settings = await readSettings(guild.id);
	if (!accept && settings.appealsBlockOnDenial) {
		await createAppealBlock(container.prisma, guild.id, { userId: appeal.userId, reason, moderatorId: reviewerId, automatic: true }).catch(
			(error: unknown) => container.logger.warn(`[Appeals] Could not block ${appeal.userId} of ${guild.id}:`, error)
		);
	}

	// A member who does not take direct messages is not told, which is not a failure of the decision:
	const key = accept ? 'moderation:appealDmAccepted' : 'moderation:appealDmDenied';
	const lines: string[] = [t(key, { guild: guild.name, case: appeal.caseId, reason: reason ?? '-' })];
	if (!settings.appealsAnonymous) {
		const moderator = await container.gatewayClient.users.fetch(reviewerId).catch(() => null);
		if (moderator !== null) lines.push(t('moderation:appealDmDecidedBy', { moderator: moderator.username }));
	}

	const user = await container.gatewayClient.users.fetch(appeal.userId).catch(() => null);
	const sent = await user?.send({ content: lines.join('\n'), allowed_mentions: { parse: [] } }).catch(() => null);
	return { delivered: Boolean(sent) };
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
	if (entry !== null && !(AppealableTypes as readonly number[]).includes(entry.type)) return { error: 'caseGone' };

	// `undo` acts on the member, not the case: a case that ended or was deleted has nothing to undo, and what the member is
	// under now may be another case.
	const inCourse = entry !== null && !entry.isUndo() && !entry.isCompleted() && !entry.isArchived();
	const decision = await applyAppealDecision(guild, appeal, inCourse ? (entry.type as AppealableType) : null, accept, reviewerId, reason);
	if ('error' in decision) return decision;

	if (appeal.threadId !== null) {
		await container.gatewayClient.api.channels
			.edit(appeal.threadId, { archived: true })
			.catch((error: unknown) => container.logger.warn(`[Appeals] Could not archive the thread of the appeal ${appeal.id}:`, error));
	}

	const t = await fetchGuildT(guild);
	const message = renderAppealMessage(t, appeal, entry, accept ? 'accepted' : 'denied', reviewerId, reason);
	const [embed] = message.embeds;
	if (!decision.delivered && embed.footer) embed.footer.text = `${embed.footer.text} · ${t('moderation:appealNotDelivered')}`;
	return { message };
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

/**
 * Takes a role that was deleted out of the forms of a guild. Two roles deleted at once wait for each other, or the second
 * would write back the first from what it read.
 */
export function forgetDeletedAppealRole(guildId: Snowflake, roleId: Snowflake) {
	return withSharedLock(`appeals:forms:${guildId}`, () => forgetAppealFormRole(container.prisma, guildId, roleId));
}
