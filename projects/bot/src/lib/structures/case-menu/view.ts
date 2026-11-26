import type { ModerationManager } from '#lib/moderation';
import { getAction } from '#lib/moderation/actions';
import { formatCaseRoleMentions } from '#lib/moderation/common/roles';
import { canEditCaseDuration, MaximumCaseReasonLength, MaximumCaseStaffNoteLength } from '#lib/moderation/caseEdits';
import { getTranslationKey } from '#lib/moderation/common/util';
import { quoteLines } from '#lib/moderation/common/wording';
import { encodeCaseMenuId, type CaseMenuVerb } from '#lib/structures/case-menu/ids';
import { caseMenuButton, getCaseTypeEmojiKey, type CaseMenuMessage } from '#lib/structures/case-menu/list';
import { Emojis, getEmojiComponent } from '#utils/emojis';
import { messageLink, time, TimestampStyles, userMention } from '@discordjs/formatters';
import { cutText, isNullishOrEmpty, isNullishOrZero } from '@sapphire/utilities';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import {
	ButtonStyle,
	ComponentType,
	MessageFlags,
	TextInputStyle,
	type APIComponentInContainer,
	type APILabelComponent,
	type APIModalInteractionResponseCallbackData,
	type Snowflake
} from 'discord-api-types/v10';
import type { ModerationCaseChange, ModerationCaseData, ModerationCaseEdit } from 'wolfstar-database';
import { seconds } from 'wolfstar-shared';

/**
 * The custom IDs of the fields of the modals of a case.
 */
export const CaseInputIds = {
	Reason: 'reason',
	Duration: 'duration',
	StaffNote: 'staffNote',
	Proof: 'proof',
	Notify: 'notify'
} as const;

/**
 * How many edits the history of a case shows, the latest ones.
 */
export const CaseHistoryEntries = 8;

/**
 * What the moderators added to a case, which is shown with it.
 */
export interface CaseViewDetails {
	staffNote: string | null;
	proof: ModerationCaseData['proof'];
	/**
	 * The file of the proof, read from its message, `null` when it could not be read.
	 */
	proofFile: { url: string; contentType: string | null } | null;
}

export interface CaseViewContext {
	/**
	 * The function to translate with: the language of the moderator, or the one of the guild for a case everybody sees.
	 */
	t: TFunction<AnyNamespace>;
	/**
	 * The moderator who opened the case, the only one that can use its buttons.
	 */
	ownerId: Snowflake;
	/**
	 * Whether only the moderator sees the case.
	 */
	ephemeral: boolean;
}

/**
 * The key of the status of a case: closed when it was archived, completed when it ended or was undone, open otherwise.
 */
export function getCaseStatusKey(entry: ModerationManager.Entry) {
	if (entry.isArchived()) return 'commands/case:statusClosed' as const;
	if (entry.isCompleted() || entry.expired) return 'commands/case:statusCompleted' as const;
	return 'commands/case:statusOpen' as const;
}

/**
 * Renders a case: what it is, who it is about, who made it, how it stands, its duration and its reason, then the
 * buttons that edit it, close it, show its history and delete it.
 *
 * @param context - The context of the case.
 * @param entry - The case.
 * @param details - What the moderators added to the case. A case everybody sees is rendered without it.
 */
export function renderCaseView(context: CaseViewContext, entry: ModerationManager.Entry, details: CaseViewDetails | null = null): CaseMenuMessage {
	const { t, ownerId } = context;
	const id = (verb: CaseMenuVerb) => encodeCaseMenuId({ ownerId, verb, target: entry.id.toString(), page: 0 });

	const lines = [
		`## ${Emojis[getCaseTypeEmojiKey(entry.type)]} ${t('commands/case:viewTitle', {
			caseId: entry.id,
			type: t(getTranslationKey(entry.type)).toUpperCase()
		})}`,
		t('commands/case:viewUser', { mention: userMention(entry.userId), userId: entry.userId }),
		t('commands/case:viewModerator', { mention: userMention(entry.moderatorId), userId: entry.moderatorId }),
		t('commands/case:viewStatus', { status: t(getCaseStatusKey(entry)) })
	];

	if (entry.isUndo()) lines.push(t('commands/case:viewUndo'));
	if (!isNullishOrZero(entry.duration)) {
		lines.push(
			// The generated typings take the value of a formatter as the text it writes, and it is given the number:
			t('commands/case:viewDuration', {
				duration: entry.duration as unknown as string,
				time: time(seconds.fromMilliseconds(entry.expiresTimestamp!), TimestampStyles.RelativeTime)
			})
		);
	}

	lines.push(
		t('commands/case:viewReason'),
		// Cut once quoted, since quoting adds two characters to every line, so the case fits the 4000 of a message:
		cutText(quoteLines(isNullishOrEmpty(entry.reason) ? t('commands/case:viewReasonNone') : entry.reason), 1000)
	);

	const reference = entry.messageReference;
	const roles = formatCaseRoleMentions(t, entry);
	if (roles !== null) lines.push(t('moderation:embedRoles', { roles }));
	if (reference !== null) {
		lines.push(t('commands/case:viewMessage', { url: messageLink(reference.channelId, reference.messageId, entry.guild.id) }));
	}

	if (details !== null && !isNullishOrEmpty(details.staffNote)) {
		lines.push(t('commands/case:viewStaffNote'), cutText(quoteLines(details.staffNote), 1000));
	}

	if (details !== null && details.proof !== null) {
		lines.push(t('commands/case:viewProof', { url: messageLink(details.proof.channelId, details.proof.messageId, entry.guild.id) }));
	}

	const createdAt = seconds.fromMilliseconds(entry.createdAt);
	const body: APIComponentInContainer[] = [{ type: ComponentType.TextDisplay, content: lines.join('\n') }];
	// A gallery only shows images and videos, which is what a proof is:
	if (details?.proofFile) body.push({ type: ComponentType.MediaGallery, items: [{ media: { url: details.proofFile.url } }] });

	body.push(
		{ type: ComponentType.Separator },
		{
			type: ComponentType.TextDisplay,
			content: `-# ${time(createdAt, TimestampStyles.LongDateTime)} (${time(createdAt, TimestampStyles.RelativeTime)})`
		},
		{
			type: ComponentType.ActionRow,
			components: [
				caseMenuButton(id('edit'), { label: t('commands/case:buttonEdit'), emoji: getEmojiComponent('Edit') }),
				caseMenuButton(id('close'), {
					label: t('commands/case:buttonClose'),
					emoji: getEmojiComponent('Lock'),
					disabled: entry.isArchived()
				}),
				caseMenuButton(id('history'), { label: t('commands/case:buttonHistory'), emoji: getEmojiComponent('History') }),
				caseMenuButton(id('delete'), { label: t('commands/case:buttonDelete'), emoji: getEmojiComponent('Delete') })
			]
		}
	);

	return {
		components: [{ type: ComponentType.Container, components: body }],
		flags: context.ephemeral ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.IsComponentsV2,
		allowed_mentions: { parse: [] }
	};
}

/**
 * Asks whether to delete a case, in place of the case: a deleted case cannot be brought back.
 *
 * @param context - The context of the case.
 * @param caseId - The ID of the case.
 */
export function renderCaseDeletePrompt(context: CaseViewContext, caseId: number): CaseMenuMessage {
	const { t, ownerId } = context;
	const id = (verb: CaseMenuVerb) => encodeCaseMenuId({ ownerId, verb, target: caseId.toString(), page: 0 });

	return {
		components: [
			{
				type: ComponentType.Container,
				components: [
					{ type: ComponentType.TextDisplay, content: `${Emojis.Warning} ${t('commands/case:deletePrompt', { caseId })}` },
					{
						type: ComponentType.ActionRow,
						components: [
							caseMenuButton(id('deleteConfirm'), {
								label: t('commands/case:buttonDelete'),
								emoji: getEmojiComponent('Delete'),
								style: ButtonStyle.Danger
							}),
							caseMenuButton(id('deleteCancel'), { label: t('commands/case:buttonCancel') })
						]
					}
				]
			}
		],
		flags: context.ephemeral ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.IsComponentsV2,
		allowed_mentions: { parse: [] }
	};
}

/**
 * The modal that edits a case: its reason, its duration when the case takes one, the note of the moderators, a proof,
 * and whether the user is told.
 *
 * @param context - The context of the case.
 * @param entry - The case.
 * @param staffNote - The note the case has.
 * @param notify - Whether the checkbox that tells the user starts ticked, which is what the server does for its cases.
 */
export function renderCaseEditModal(
	context: Pick<CaseViewContext, 't' | 'ownerId'>,
	entry: ModerationManager.Entry,
	staffNote: string | null,
	notify: boolean
): APIModalInteractionResponseCallbackData {
	const { t, ownerId } = context;
	const components: APILabelComponent[] = [
		{
			type: ComponentType.Label,
			label: cutText(t('commands/case:editReasonLabel'), 45),
			component: {
				type: ComponentType.TextInput,
				custom_id: CaseInputIds.Reason,
				style: TextInputStyle.Paragraph,
				required: false,
				max_length: MaximumCaseReasonLength,
				...(isNullishOrEmpty(entry.reason) ? {} : { value: cutText(entry.reason, MaximumCaseReasonLength) })
			}
		}
	];

	if (canEditCaseDuration(entry)) {
		components.push({
			type: ComponentType.Label,
			label: cutText(t('commands/case:editDurationLabel'), 45),
			description: cutText(t('commands/case:editDurationDescription'), 100),
			component: {
				type: ComponentType.TextInput,
				custom_id: CaseInputIds.Duration,
				style: TextInputStyle.Short,
				required: false,
				max_length: 50
			}
		});
	}

	components.push(
		{
			type: ComponentType.Label,
			label: cutText(t('commands/case:editStaffNoteLabel'), 45),
			description: cutText(t('commands/case:editStaffNoteDescription'), 100),
			component: {
				type: ComponentType.TextInput,
				custom_id: CaseInputIds.StaffNote,
				style: TextInputStyle.Paragraph,
				required: false,
				max_length: MaximumCaseStaffNoteLength,
				...(isNullishOrEmpty(staffNote) ? {} : { value: cutText(staffNote, MaximumCaseStaffNoteLength) })
			}
		},
		{
			type: ComponentType.Label,
			label: cutText(t('commands/case:editProofLabel'), 45),
			description: cutText(t('commands/case:editProofDescription'), 100),
			component: { type: ComponentType.FileUpload, custom_id: CaseInputIds.Proof, required: false, min_values: 0, max_values: 1 }
		}
	);
	if (getAction(entry.type).isDirectMessageAvailable) components.push(renderNotifyField(t, notify));

	return {
		custom_id: encodeCaseMenuId({ ownerId, verb: 'editSubmit', target: entry.id.toString(), page: 0 }),
		title: cutText(t('commands/case:editTitle', { caseId: entry.id }), 45),
		components
	};
}

/**
 * The modal that closes a case: why, and whether the user is told.
 *
 * @param context - The context of the case.
 * @param entry - The case to close.
 * @param notify - Whether the checkbox that tells the user starts ticked.
 */
export function renderCaseCloseModal(
	context: Pick<CaseViewContext, 't' | 'ownerId'>,
	entry: ModerationManager.Entry,
	notify: boolean
): APIModalInteractionResponseCallbackData {
	const { t, ownerId } = context;
	const caseId = entry.id;
	return {
		custom_id: encodeCaseMenuId({ ownerId, verb: 'closeSubmit', target: caseId.toString(), page: 0 }),
		title: cutText(t('commands/case:closeTitle', { caseId }), 45),
		components: [
			{
				type: ComponentType.Label,
				label: cutText(t('commands/case:closeReasonLabel'), 45),
				component: {
					type: ComponentType.TextInput,
					custom_id: CaseInputIds.Reason,
					style: TextInputStyle.Short,
					required: false,
					max_length: 200,
					value: cutText(t('commands/case:closeReasonDefault'), 200)
				}
			},
			...(getAction(entry.type).isDirectMessageAvailable ? [renderNotifyField(t, notify)] : [])
		]
	};
}

function renderNotifyField(t: TFunction<AnyNamespace>, notify: boolean): APILabelComponent {
	return {
		type: ComponentType.Label,
		label: cutText(t('commands/case:notifyLabel'), 45),
		component: { type: ComponentType.Checkbox, custom_id: CaseInputIds.Notify, default: notify }
	};
}

const CaseChangeFieldKeys = {
	reason: 'commands/case:fieldReason',
	duration: 'commands/case:fieldDuration',
	staffNote: 'commands/case:fieldStaffNote',
	proof: 'commands/case:fieldProof',
	status: 'commands/case:fieldStatus',
	closeReason: 'commands/case:fieldCloseReason'
} as const satisfies Record<ModerationCaseChange['field'], string>;

/**
 * Writes a value of a change of the history as it is read: a duration as a time span, a status by its name.
 */
function formatCaseChangeValue(t: TFunction<AnyNamespace>, field: ModerationCaseChange['field'], value: string | null): string {
	if (value === null) return t('commands/case:historyNone');
	if (field === 'duration') return t('commands/case:historyDuration', { duration: Number(value) as unknown as string });
	if (field === 'status') return t(value === 'closed' ? 'commands/case:statusClosed' : 'commands/case:statusOpen');
	if (field === 'proof') return value;
	return cutText(value.replaceAll('\n', ' '), 200);
}

/**
 * Renders the history of a case: who edited it, when, and what each edit changed, the latest first.
 *
 * @param t - The function to translate with.
 * @param caseId - The ID of the case.
 * @param edits - The edits of the case, the latest first. It must have one, a case with none is told with a status.
 */
export function renderCaseHistory(t: TFunction<AnyNamespace>, caseId: number, edits: readonly ModerationCaseEdit[]): CaseMenuMessage {
	const title = cutText(`## ${Emojis.History} ${t('commands/case:historyTitle', { caseId })}`, 200);
	const body: APIComponentInContainer[] = [{ type: ComponentType.TextDisplay, content: title }];
	let remaining = 3700 - title.length;
	let shown = 0;

	for (const edit of edits.slice(0, CaseHistoryEntries)) {
		const createdAt = seconds.fromMilliseconds(edit.createdAt);
		const lines = edit.changes.map((change) =>
			t('commands/case:historyChange', {
				field: t(CaseChangeFieldKeys[change.field]),
				before: formatCaseChangeValue(t, change.field, change.before),
				after: formatCaseChangeValue(t, change.field, change.after)
			})
		);
		const content = [
			`${userMention(edit.moderatorId)} • ${time(createdAt, TimestampStyles.ShortDateTime)} (${time(createdAt, TimestampStyles.RelativeTime)})`,
			...lines
		].join('\n');
		if (content.length > remaining && shown > 0) break;
		const fitted = cutText(content, remaining);
		remaining -= fitted.length;
		shown++;
		body.push(
			{ type: ComponentType.Separator },
			{
				type: ComponentType.TextDisplay,
				content: fitted
			}
		);
	}

	if (edits.length > shown) {
		body.push(
			{ type: ComponentType.Separator },
			{ type: ComponentType.TextDisplay, content: cutText(`-# ${t('commands/case:historyMore', { count: edits.length - shown })}`, 250) }
		);
	}

	return {
		components: [{ type: ComponentType.Container, components: body }],
		flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		allowed_mentions: { parse: [] }
	};
}
