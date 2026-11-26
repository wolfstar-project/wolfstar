import type { ModerationManager } from '#lib/moderation';
import { getTitle, getTranslationKey } from '#lib/moderation/common/util';
import { encodeCaseMenuId, type CaseMenuVerb } from '#lib/structures/case-menu/ids';
import { getCaseTypeEmojiKey } from '#lib/moderation/common/wording';
import { Emojis, getEmojiComponent, type EmojiComponent } from '#utils/emojis';
import { TypeVariation } from '#utils/moderationConstants';
import { time, TimestampStyles, userMention } from '@discordjs/formatters';
import { cutText, isNullishOrZero } from '@sapphire/utilities';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import {
	ButtonStyle,
	ComponentType,
	MessageFlags,
	type APIButtonComponentWithCustomId,
	type APIComponentInContainer,
	type APIInteractionResponseCallbackData,
	type Snowflake
} from 'discord-api-types/v10';
import { desc, seconds } from 'wolfstar-shared';

/**
 * How many cases a page of the list shows. A message holds 40 components, and every case takes three of them (the
 * section, its text and its button) on top of the 14 of the rest of the list.
 */
export const CasesPerPage = 5;

/**
 * The types of case the select menu of the list filters by, in the order it lists them.
 */
export const CaseListTypes = [
	TypeVariation.Warning,
	TypeVariation.Mute,
	TypeVariation.Timeout,
	TypeVariation.Kick,
	TypeVariation.Softban,
	TypeVariation.Ban,
	TypeVariation.VoiceMute,
	TypeVariation.VoiceKick,
	TypeVariation.RestrictedAttachment,
	TypeVariation.RestrictedEmbed,
	TypeVariation.RestrictedEmoji,
	TypeVariation.RestrictedReaction,
	TypeVariation.RestrictedVoice,
	TypeVariation.SetNickname,
	TypeVariation.RoleAdd,
	TypeVariation.RoleRemove,
	TypeVariation.Note
] as const;

/**
 * What the list shows: every case, the temporary ones that are still in course, or the ones of a type.
 */
export type CaseListFilter = 'all' | 'pending' | TypeVariation;

/**
 * What a list shows, which every one of its components carries in its custom ID.
 */
export interface CaseListState {
	filter: CaseListFilter;
	/**
	 * The user whose cases are listed, `null` for the ones of every user.
	 */
	userId: Snowflake | null;
	/**
	 * The page, the first being `0`.
	 */
	page: number;
}

/**
 * The value of an option of the select menu of the list, which is also how a filter is written in a custom ID.
 */
export function encodeCaseListFilter(filter: CaseListFilter): string {
	return typeof filter === 'number' ? filter.toString() : filter;
}

/**
 * Reads what {@linkcode encodeCaseListFilter} wrote.
 *
 * @returns The filter, or `null` when the value is not one.
 */
export function decodeCaseListFilter(value: string | undefined): CaseListFilter | null {
	if (value === 'all' || value === 'pending') return value;
	if (value === undefined || !/^\d{1,2}$/.test(value)) return null;

	const type = Number(value);
	return (CaseListTypes as readonly number[]).includes(type) ? (type as TypeVariation) : null;
}

/**
 * Writes what a list shows as the target of a custom ID, `<filter>/<userId>`, a `-` for the cases of every user.
 */
export function encodeCaseListTarget(state: Pick<CaseListState, 'filter' | 'userId'>): string {
	return `${encodeCaseListFilter(state.filter)}/${state.userId ?? '-'}`;
}

/**
 * Reads what {@linkcode encodeCaseListTarget} wrote.
 *
 * @returns What the list shows, or `null` when the target is not one of a list.
 */
export function decodeCaseListTarget(target: string): Pick<CaseListState, 'filter' | 'userId'> | null {
	const [filterValue, userValue, ...rest] = target.split('/');
	const filter = decodeCaseListFilter(filterValue);
	if (filter === null || userValue === undefined || rest.length > 0) return null;
	if (userValue === '-') return { filter, userId: null };

	return /^\d{17,20}$/.test(userValue) ? { filter, userId: userValue } : null;
}

/**
 * Takes the cases a filter shows, the newest first.
 *
 * @param entries - The cases of the guild, or of a user.
 * @param filter - What to show.
 */
export function filterCaseEntries(entries: readonly ModerationManager.Entry[], filter: CaseListFilter): ModerationManager.Entry[] {
	const shown =
		filter === 'all'
			? [...entries]
			: filter === 'pending'
				? entries.filter((entry) => !isNullishOrZero(entry.duration) && !entry.isCompleted() && !entry.isArchived())
				: entries.filter((entry) => entry.type === filter);
	return shown.sort((a, b) => desc(a.id, b.id));
}

export { getCaseTypeEmojiKey } from '#lib/moderation/common/wording';

export interface CaseListContext {
	/**
	 * The function to translate with: the language of the moderator, or the one of the guild for a list everybody sees.
	 */
	t: TFunction<AnyNamespace>;
	/**
	 * The moderator who opened the list, the only one that can use it.
	 */
	ownerId: Snowflake;
	/**
	 * Whether only the moderator sees the list.
	 */
	ephemeral: boolean;
}

/**
 * The body of a message of the case menu, which is made of components only.
 */
export type CaseMenuMessage = Pick<APIInteractionResponseCallbackData, 'components' | 'flags' | 'allowed_mentions'>;

/**
 * Renders a page of the list of the cases: the title with the button that reads the cases again, the select menu of
 * what to show, a row for each case with the button that opens it, and the pages.
 *
 * @param context - The context of the list.
 * @param state - What the list shows. A page past the last one is the last one, since a case can be deleted meanwhile.
 * @param entries - The cases of the guild, or of the user of the state, which the filter of the state is applied to.
 */
export function renderCaseList(context: CaseListContext, state: CaseListState, entries: readonly ModerationManager.Entry[]): CaseMenuMessage {
	const { t, ownerId } = context;
	const shown = filterCaseEntries(entries, state.filter);
	const pages = Math.max(1, Math.ceil(shown.length / CasesPerPage));
	const current = Math.min(state.page, pages - 1);
	const target = encodeCaseListTarget(state);
	const id = (verb: CaseMenuVerb, to: string, page: number) => encodeCaseMenuId({ ownerId, verb, target: to, page });

	const title = `## ${Emojis.History} ${t('commands/case:listTitle')}`;
	const body: APIComponentInContainer[] = [
		{
			type: ComponentType.Section,
			components: [
				{
					type: ComponentType.TextDisplay,
					content: state.userId === null ? title : `${title}\n-# ${t('commands/case:listUser', { user: userMention(state.userId) })}`
				}
			],
			// The pages have the same ID as this button when they show the same page, and an ID is of one component:
			accessory: caseMenuButton(`${id('list', target, current)}:refresh`, { emoji: getEmojiComponent('Refresh') })
		},
		{
			type: ComponentType.ActionRow,
			components: [
				{
					type: ComponentType.StringSelect,
					custom_id: id('filter', target, 0),
					options: [
						{ label: cutText(t('commands/case:filterAll'), 100), value: 'all', default: state.filter === 'all' },
						{ label: cutText(t('commands/case:filterPending'), 100), value: 'pending', default: state.filter === 'pending' },
						...CaseListTypes.map((type) => ({
							label: cutText(t(getTranslationKey(type)), 100),
							value: encodeCaseListFilter(type),
							emoji: getEmojiComponent(getCaseTypeEmojiKey(type)),
							default: state.filter === type
						}))
					]
				}
			]
		},
		{ type: ComponentType.Separator }
	];

	const first = current * CasesPerPage;
	for (const entry of shown.slice(first, first + CasesPerPage)) {
		body.push({
			type: ComponentType.Section,
			components: [{ type: ComponentType.TextDisplay, content: renderCaseListRow(t, entry) }],
			accessory: caseMenuButton(id('view', entry.id.toString(), 0), { emoji: getEmojiComponent('ArrowRight') })
		});
	}

	if (shown.length === 0) body.push({ type: ComponentType.TextDisplay, content: t('commands/case:listEmpty') });

	if (pages > 1) {
		const page = (to: number, emoji: EmojiComponent, disabled: boolean) => caseMenuButton(id('list', target, to), { emoji, disabled });
		body.push(
			{ type: ComponentType.Separator },
			{
				type: ComponentType.TextDisplay,
				content: `-# ${t('commands/case:listFooter', { page: current + 1, pages, count: shown.length })}`
			},
			{
				type: ComponentType.ActionRow,
				components: deduplicate([
					page(0, getEmojiComponent('ArrowLeftFast'), current === 0),
					page(Math.max(0, current - 1), getEmojiComponent('ArrowLeft'), current === 0),
					page(Math.min(pages - 1, current + 1), getEmojiComponent('ArrowRight'), current >= pages - 1),
					page(pages - 1, getEmojiComponent('ArrowRightFast'), current >= pages - 1)
				])
			}
		);
	}

	return {
		components: [{ type: ComponentType.Container, components: body }],
		flags: context.ephemeral ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.IsComponentsV2,
		allowed_mentions: { parse: [] }
	};
}

/**
 * The two lines of a case in the list: its emoji, its ID and its user, then what was done, by whom and when.
 */
function renderCaseListRow(t: TFunction<AnyNamespace>, entry: ModerationManager.Entry): string {
	const lines = [
		`${Emojis[getCaseTypeEmojiKey(entry.type)]} **#${entry.id}** ${userMention(entry.userId)}`,
		`-# ${t('commands/case:listRow', {
			type: getTitle(t, entry),
			moderator: userMention(entry.moderatorId),
			time: time(seconds.fromMilliseconds(entry.createdAt), TimestampStyles.LongDateTime)
		})}`
	];
	if (entry.isArchived()) lines[1] += ` • ${t('commands/case:statusClosed')}`;

	return lines.join('\n');
}

interface ButtonOptions {
	label?: string;
	emoji?: EmojiComponent;
	style?: APIButtonComponentWithCustomId['style'];
	disabled?: boolean;
}

/**
 * A button of the case menu, grey unless it is given a style.
 */
export function caseMenuButton(customId: string, options: ButtonOptions): APIButtonComponentWithCustomId {
	return {
		type: ComponentType.Button,
		custom_id: customId,
		style: options.style ?? ButtonStyle.Secondary,
		...(options.label === undefined ? {} : { label: cutText(options.label, 80) }),
		...(options.emoji === undefined ? {} : { emoji: options.emoji }),
		...(options.disabled ? { disabled: true } : {})
	};
}

/**
 * Makes the custom IDs of the buttons unique, by numbering the ones that repeat an ID: the first and the previous page
 * are both the first one on the second page, and the handler only reads the first three parts of an ID.
 */
function deduplicate(buttons: APIButtonComponentWithCustomId[]): APIButtonComponentWithCustomId[] {
	const seen = new Set<string>();
	return buttons.map((entry, index) => {
		if (!seen.has(entry.custom_id)) {
			seen.add(entry.custom_id);
			return entry;
		}

		return { ...entry, custom_id: `${entry.custom_id}:${index}` };
	});
}
