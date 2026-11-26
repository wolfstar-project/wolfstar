import type { ModerationManager } from '#lib/moderation';
import { getTranslationKey } from '#lib/moderation/common/util';
import { encodeCaseMenuId, type CaseMenuVerb } from '#lib/structures/case-menu/ids';
import { caseMenuButton, getCaseTypeEmojiKey, type CaseMenuMessage } from '#lib/structures/case-menu/list';
import { Emojis, getEmojiComponent } from '#utils/emojis';
import { blockQuote, messageLink, time, TimestampStyles, userMention } from '@discordjs/formatters';
import { cutText, isNullishOrEmpty, isNullishOrZero } from '@sapphire/utilities';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import { ButtonStyle, ComponentType, MessageFlags, type APIComponentInContainer, type Snowflake } from 'discord-api-types/v10';
import { seconds } from 'wolfstar-shared';

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
 */
export function renderCaseView(context: CaseViewContext, entry: ModerationManager.Entry): CaseMenuMessage {
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
		blockQuote(isNullishOrEmpty(entry.reason) ? t('commands/case:viewReasonNone') : cutText(entry.reason, 1000))
	);

	const reference = entry.messageReference;
	if (reference !== null) {
		lines.push(t('commands/case:viewMessage', { url: messageLink(reference.channelId, reference.messageId, entry.guild.id) }));
	}

	const createdAt = seconds.fromMilliseconds(entry.createdAt);
	const body: APIComponentInContainer[] = [
		{ type: ComponentType.TextDisplay, content: lines.join('\n') },
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
	];

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
