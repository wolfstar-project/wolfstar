import { readSettings } from '#lib/database';
import { getAction } from '#lib/moderation/actions';
import { fetchGuildT, getTitle, getTranslationKey } from '#lib/moderation/common/util';
import type { ModerationManager } from '#lib/moderation/managers/ModerationManager';
import { getModeration } from '#utils/functions';
import { resolveTimeSpan } from '#utils/resolvers';
import { renderStatusContainer } from '#utils/status';
import { messageLink, time, TimestampStyles } from '@discordjs/formatters';
import { cutText, isNullish, isNullishOrEmpty } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import {
	MessageFlags,
	Routes,
	type APIAttachment,
	type RESTPostAPIChannelMessageJSONBody,
	type RESTPostAPIChannelMessageResult,
	type Snowflake
} from 'discord-api-types/v10';
import {
	addModerationCaseEdit,
	fetchModerationCaseData,
	setModerationCaseDetails,
	type ModerationCaseChange,
	type ModerationCaseData
} from 'wolfstar-database';
import { seconds } from 'wolfstar-shared';

/**
 * The most characters the reason of a case holds, as the `reason` option of the moderation commands.
 */
export const MaximumCaseReasonLength = 500;

/**
 * The most characters the note of the moderators on a case holds.
 */
export const MaximumCaseStaffNoteLength = 1000;

/**
 * The largest proof a moderator gives, 10 MB: what a bot uploads to a guild with no boost.
 */
export const MaximumCaseProofSize = 10 * 1024 * 1024;

/**
 * The hosts Discord serves the attachments of an interaction from.
 */
const AttachmentHosts = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

/**
 * What an edit can change of a case, as it is before or after the edit.
 */
export interface CaseEditValues {
	reason: string | null;
	/** In milliseconds, `null` for a case with no duration. */
	duration: number | null;
	staffNote: string | null;
	/** The message that holds the proof. */
	proof: ModerationCaseData['proof'];
}

/**
 * Works out what an edit changes: an entry for each value that is given and differs from the one the case has.
 *
 * @param guildId - The guild of the case, for the link of a proof.
 * @param before - What the case has.
 * @param after - What the edit gives. A key that is left out is not changed.
 */
export function getCaseChanges(guildId: Snowflake, before: CaseEditValues, after: Partial<CaseEditValues>): ModerationCaseChange[] {
	const proofLink = (proof: CaseEditValues['proof']) => (proof === null ? null : messageLink(proof.channelId, proof.messageId, guildId));
	const changes: ModerationCaseChange[] = [];
	const push = (field: ModerationCaseChange['field'], from: string | null, to: string | null) => {
		if (from !== to) changes.push({ field, before: from, after: to });
	};

	if (after.reason !== undefined) push('reason', before.reason, after.reason);
	if (after.duration !== undefined) push('duration', before.duration?.toString() ?? null, after.duration?.toString() ?? null);
	if (after.staffNote !== undefined) push('staffNote', before.staffNote, after.staffNote);
	if (after.proof !== undefined) push('proof', proofLink(before.proof), proofLink(after.proof));

	return changes;
}

/**
 * Whether the duration of a case can be edited: its type takes one the bot keeps, and the case is still in course.
 */
export function canEditCaseDuration(entry: ModerationManager.Entry): boolean {
	const action = getAction(entry.type);
	return action.isUndoActionAvailable && !action.durationExternal && !entry.isCompleted();
}

/**
 * Reads the duration a moderator wrote for a case.
 *
 * @returns `undefined` when none was written, `null` when `0` removes the duration, the milliseconds otherwise.
 * @throws The translated error when the text is no duration, or the case does not take the one it gives.
 */
export function resolveCaseDuration(t: TFunction<AnyNamespace>, entry: ModerationManager.Entry, parameter: string | null | undefined) {
	if (isNullishOrEmpty(parameter?.trim())) return undefined;

	const action = getAction(entry.type);
	const type = t(getTranslationKey(entry.type));
	if (action.durationExternal) throw t('commands/case:timeEditNotSupported', { type });
	if (!action.isUndoActionAvailable) throw t('commands/case:timeNotAllowed', { type });
	if (entry.isCompleted()) throw t('commands/case:timeNotAllowedInCompletedEntries', { caseId: entry.id });

	const result = resolveTimeSpan(parameter!.trim(), { minimum: action.minimumDuration, maximum: action.maximumDuration });
	if (result.isErr()) {
		throw t(result.unwrapErr() as never, { parameter, minimum: action.minimumDuration, maximum: action.maximumDuration }) as unknown as string;
	}

	const duration = result.unwrap();
	if (duration === 0) return null;

	const next = entry.createdAt + duration;
	if (next <= Date.now()) {
		throw t('commands/case:timeTooEarly', {
			start: time(seconds.fromMilliseconds(entry.createdAt), TimestampStyles.LongDateTime),
			time: time(seconds.fromMilliseconds(next), TimestampStyles.RelativeTime)
		});
	}

	return duration;
}

export interface CaseEditRequest {
	entry: ModerationManager.Entry;
	/** The moderator who edits the case. */
	moderatorId: Snowflake;
	/** The language of the moderator, for what they are warned about. */
	t: TFunction<AnyNamespace>;
	/** What the edit gives, a key that is left out is not changed. */
	values: Partial<Omit<CaseEditValues, 'proof'>>;
	/** The file the moderator gave as the proof, which takes the place of the one the case has. */
	proof?: APIAttachment;
	/** Whether the user of the case is told about the edit in a direct message. */
	notify: boolean;
}

export interface CaseEditOutcome {
	/** What the edit changed, empty when the case already was as asked. */
	changes: ModerationCaseChange[];
	/** What could not be done, already translated: a proof that could not be kept, a direct message that was not delivered. */
	warnings: string[];
}

/**
 * Edits a case: its reason and its duration in its row, the note of the moderators and the proof next to it, and the
 * edit in the history of the case.
 *
 * @remarks The user is only told about a new reason or duration. The note of the moderators is never told.
 */
export async function editCase(request: CaseEditRequest): Promise<CaseEditOutcome> {
	const { entry, t } = request;
	const guildId = entry.guild.id;
	const warnings: string[] = [];

	const stored = await fetchModerationCaseData(container.prisma.orm, guildId, entry.id);
	const before: CaseEditValues = {
		reason: entry.reason,
		duration: entry.duration,
		staffNote: stored?.staffNote ?? null,
		proof: stored?.proof ?? null
	};

	const after: Partial<CaseEditValues> = { ...request.values };
	if (request.proof !== undefined) {
		const proof = await storeCaseProof(entry, request.proof);
		if (proof.ok) after.proof = proof.value;
		else warnings.push(t(proof.key));
	}

	const changes = getCaseChanges(guildId, before, after);
	if (changes.length === 0) return { changes, warnings };

	const changed = new Set(changes.map((change) => change.field));
	if (changed.has('reason') || changed.has('duration')) {
		const moderation = await getModeration(guildId);
		await moderation.edit(entry, {
			reason: after.reason === undefined ? entry.reason : after.reason,
			duration: after.duration === undefined ? entry.duration : after.duration
		});
	}

	if (changed.has('staffNote') || changed.has('proof')) {
		await setModerationCaseDetails(container.prisma, guildId, entry.id, {
			...(changed.has('staffNote') ? { staffNote: after.staffNote } : {}),
			...(changed.has('proof') ? { proof: after.proof } : {})
		});
	}

	await addModerationCaseEdit(container.prisma, guildId, { caseId: entry.id, moderatorId: request.moderatorId, changes });

	if (request.notify && getAction(entry.type).isDirectMessageAvailable && (changed.has('reason') || changed.has('duration'))) {
		const delivered = await notifyCaseUser(entry, 'commands/case:dmEdited');
		if (!delivered) warnings.push(t('commands/case:notifyUndelivered'));
	}

	return { changes, warnings };
}

export interface CaseCloseRequest {
	entry: ModerationManager.Entry;
	/** The moderator who closes the case. */
	moderatorId: Snowflake;
	/** The language of the moderator, for what they are warned about. */
	t: TFunction<AnyNamespace>;
	/** Why the case is closed, `null` when the moderator gave no reason. */
	reason: string | null;
	/** Whether the user of the case is told in a direct message. */
	notify: boolean;
}

/**
 * Closes a case: it is archived, so it stops counting, and its history says who closed it and why.
 *
 * @returns The same as {@linkcode editCase}: no change when the case was already closed.
 */
export async function closeCase(request: CaseCloseRequest): Promise<CaseEditOutcome> {
	const { entry, t } = request;
	if (entry.isArchived()) return { changes: [], warnings: [] };

	const moderation = await getModeration(entry.guild.id);
	await moderation.archive(entry);

	const changes: ModerationCaseChange[] = [{ field: 'status', before: 'open', after: 'closed' }];
	if (request.reason !== null) changes.push({ field: 'closeReason', before: null, after: request.reason });
	await addModerationCaseEdit(container.prisma, entry.guild.id, { caseId: entry.id, moderatorId: request.moderatorId, changes });

	const warnings: string[] = [];
	if (request.notify && getAction(entry.type).isDirectMessageAvailable) {
		const delivered = await notifyCaseUser(entry, 'commands/case:dmClosed', request.reason);
		if (!delivered) warnings.push(t('commands/case:notifyUndelivered'));
	}

	return { changes, warnings };
}

type ProofFailureKey =
	| 'commands/case:proofNoChannel'
	| 'commands/case:proofTooLarge'
	| 'commands/case:proofInvalidType'
	| 'commands/case:proofFailed';
type ProofResult = { ok: true; value: NonNullable<CaseEditValues['proof']> } | { ok: false; key: ProofFailureKey };

/**
 * Whether a file can be the proof of a case: an image or a video the bot can upload again.
 *
 * @returns Why it cannot be, or `null` when it can.
 */
export function getCaseProofProblem(attachment: Pick<APIAttachment, 'size' | 'content_type'>): ProofFailureKey | null {
	if (attachment.size > MaximumCaseProofSize) return 'commands/case:proofTooLarge';
	if (!/^(?:image|video)\//.test(attachment.content_type ?? '')) return 'commands/case:proofInvalidType';
	return null;
}

/**
 * Keeps the proof of a case. The link of a file given in a modal stops working after a while, so the bot sends the file
 * again in the moderation log, and the case keeps that message.
 */
async function storeCaseProof(entry: ModerationManager.Entry, attachment: APIAttachment): Promise<ProofResult> {
	const problem = getCaseProofProblem(attachment);
	if (problem !== null) return { ok: false, key: problem };

	const { moderationChannel } = await readSettings(entry.guild.id);
	if (isNullish(moderationChannel)) return { ok: false, key: 'commands/case:proofNoChannel' };

	try {
		const url = new URL(attachment.url);
		if (url.protocol !== 'https:' || !AttachmentHosts.has(url.hostname)) return { ok: false, key: 'commands/case:proofFailed' };

		const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
		if (!response.ok) return { ok: false, key: 'commands/case:proofFailed' };

		const data = Buffer.from(await response.arrayBuffer());
		if (data.byteLength > MaximumCaseProofSize) return { ok: false, key: 'commands/case:proofTooLarge' };

		const t = await fetchGuildT(entry.guild);
		const body: RESTPostAPIChannelMessageJSONBody = {
			content: t('commands/case:proofMessage', { caseId: entry.id }),
			allowed_mentions: { parse: [] }
		};
		const message = (await container.rest.post(Routes.channelMessages(moderationChannel), {
			body,
			files: [{ name: attachment.filename, data, contentType: attachment.content_type }]
		})) as RESTPostAPIChannelMessageResult;
		return { ok: true, value: { channelId: moderationChannel, messageId: message.id } };
	} catch (error) {
		container.logger.debug(`[MODERATION] Could not keep the proof of case ${entry.id} of ${entry.guild.id}:`, error);
		return { ok: false, key: 'commands/case:proofFailed' };
	}
}

/**
 * Reads the link of the file of the proof of a case from its message, since the link of a file is only good for a
 * while.
 *
 * @returns The link and the type of the file, `null` when the message is gone or has no file.
 */
export async function fetchCaseProofFile(proof: NonNullable<CaseEditValues['proof']>): Promise<{ url: string; contentType: string | null } | null> {
	try {
		const message = (await container.rest.get(Routes.channelMessage(proof.channelId, proof.messageId))) as RESTPostAPIChannelMessageResult;
		const [file] = message.attachments;
		return file === undefined ? null : { url: file.url, contentType: file.content_type ?? null };
	} catch (error) {
		container.logger.debug(`[MODERATION] Could not read the proof ${proof.messageId}:`, error);
		return null;
	}
}

/**
 * Tells the user of a case, in a direct message in the language of the guild, that the case was edited or closed.
 *
 * @returns Whether the message was delivered: a user who closed their direct messages gets none.
 */
async function notifyCaseUser(
	entry: ModerationManager.Entry,
	key: 'commands/case:dmEdited' | 'commands/case:dmClosed',
	closeReason: string | null = null
): Promise<boolean> {
	try {
		const t = await fetchGuildT(entry.guild);
		const lines: string[] = [
			t(key, { caseId: entry.id, guild: entry.guild.name }),
			t('commands/case:dmType', { type: getTitle(t, entry) }),
			t('commands/case:dmReason', { reason: closeReason ?? entry.reason ?? t('commands/case:viewReasonNone') })
		];
		if (key === 'commands/case:dmEdited' && entry.expiresTimestamp !== null) {
			lines.push(t('commands/case:dmExpires', { time: time(seconds.fromMilliseconds(entry.expiresTimestamp), TimestampStyles.RelativeTime) }));
		}

		const user = await entry.fetchUser();
		await user.send({
			components: [renderStatusContainer('info', lines.join('\n'))],
			flags: MessageFlags.IsComponentsV2,
			allowed_mentions: { parse: [] }
		});
		return true;
	} catch (error) {
		container.logger.debug(`[MODERATION] Direct message about case ${entry.id} to ${entry.userId} not delivered: ${(error as Error).message}`);
		return false;
	}
}

/**
 * Keeps what a moderator gave with the command that made a case: the note only the moderators read, and a proof.
 *
 * @remarks It is not an edit, so it is not in the history of the case. A proof that cannot be kept, or a note that
 * cannot be written, does not undo the case: it is told as a warning.
 *
 * @param entry - The case the command made.
 * @param details - The `note` and the `proof` options of the command.
 * @param t - The language of the moderator, for what they are warned about.
 * @returns What could not be kept, already translated.
 */
export async function addCaseDetails(
	entry: ModerationManager.Entry,
	details: { staffNote?: string | null; proof?: APIAttachment | null },
	t: (key: ProofFailureKey | 'commands/moderation:moderationDetailsNote') => string
): Promise<string[]> {
	const warnings: string[] = [];
	const staffNote = details.staffNote?.trim() || null;

	let proof: CaseEditValues['proof'] | undefined;
	if (details.proof) {
		const stored = await storeCaseProof(entry, details.proof);
		if (stored.ok) proof = stored.value;
		else warnings.push(t(stored.key));
	}

	if (staffNote === null && proof === undefined) return warnings;

	try {
		await setModerationCaseDetails(container.prisma, entry.guild.id, entry.id, {
			...(staffNote === null ? {} : { staffNote: cutText(staffNote, MaximumCaseStaffNoteLength) }),
			...(proof === undefined ? {} : { proof })
		});
	} catch (error) {
		container.logger.error(`[MODERATION] Could not keep the details of case ${entry.id} of ${entry.guild.id}:`, error);
		warnings.push(t('commands/moderation:moderationDetailsNote'));
	}

	return warnings;
}
