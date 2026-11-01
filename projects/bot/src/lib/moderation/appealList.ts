import { AppealStatusKeys } from '#lib/moderation/appealCommands';
import { getTitle } from '#lib/moderation/common/util';
import type { TranslationKey } from '#lib/structures/commands/utils';
import { BrandingColors } from '#utils/constants';
import { Emojis, getEmojiComponent, type EmojiComponent } from '#utils/emojis';
import { getModeration } from '#utils/functions';
import { time, TimestampStyles, userMention } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import {
	ButtonStyle,
	ComponentType,
	MessageFlags,
	SeparatorSpacingSize,
	type APIButtonComponentWithCustomId,
	type APIComponentInContainer,
	type APIInteractionResponseCallbackData,
	type Snowflake
} from 'discord-api-types/v10';
import { AppealStatuses, countAppeals, fetchAppealForms, fetchAppeals, type Appeal } from 'wolfstar-database';

/**
 * The name of the interaction handler of `/appeal list`, which is also the first part of its custom IDs.
 */
export const AppealListHandlerName = 'appealList';

/**
 * How many appeals a page of the list shows.
 */
export const AppealsPerPage = 10;

/**
 * What the select menu of the list shows: every appeal, or the ones in a status.
 */
export const AppealListFilters = ['all', ...AppealStatuses] as const;
export type AppealListFilter = (typeof AppealListFilters)[number];

const AppealListFilterKeys = { all: 'commands/appeal:filterAll', ...AppealStatusKeys } as const satisfies Record<AppealListFilter, TranslationKey>;

/**
 * The value of the menu of the forms that shows every form.
 */
export const AppealListAllForms = 'all';

/**
 * How many entries a select menu holds.
 */
const MaximumSelectOptions = 25;

/**
 * What a component of the list does: `filter` and `form` are the select menus, whose selected value is what to show from
 * its first page on, and `page` the buttons, the page being the one to show.
 */
export type AppealListVerb = 'filter' | 'form' | 'page';

export interface AppealListAction {
	verb: AppealListVerb;
	filter: AppealListFilter;
	/**
	 * The ID of the form shown, or {@linkcode AppealListAllForms}.
	 */
	form: string;
	page: number;
}

/**
 * Whether a value is one of {@linkcode AppealListFilters}.
 */
export function isAppealListFilter(value: unknown): value is AppealListFilter {
	return (AppealListFilters as readonly unknown[]).includes(value);
}

/**
 * Builds the custom ID of a component of the list, `appealList.<filter>.<verb>:<page>:<form>`.
 *
 * @remarks Everything a click needs is in the ID, so the list keeps working after a restart and on any process. Only who
 * ran the command can click it, the answer being ephemeral.
 */
export function encodeAppealListId(action: AppealListAction) {
	return encodeCustomId(AppealListHandlerName, action.filter, `${action.verb}:${action.page}:${action.form}`);
}

/**
 * Reads what {@linkcode encodeAppealListId} wrote.
 *
 * @returns The action, `null` when the custom ID is not one of the list.
 */
export function decodeAppealListId(content: unknown): AppealListAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null || !isAppealListFilter(decoded.sessionId)) return null;

	const [verb, page, form] = decoded.action.split(':');
	const pageNumber = Number(page);
	if ((verb !== 'filter' && verb !== 'form' && verb !== 'page') || page === undefined || !Number.isSafeInteger(pageNumber) || pageNumber < 0) {
		return null;
	}

	if (form === undefined || (form !== AppealListAllForms && !/^\d{1,19}$/.test(form))) return null;
	return { verb, filter: decoded.sessionId, form, page: pageNumber };
}

/**
 * A page of the list, which {@linkcode renderAppealList} shows.
 */
export interface AppealListPage {
	t: TFunction<AnyNamespace>;
	filter: AppealListFilter;
	/**
	 * The ID of the form shown, or {@linkcode AppealListAllForms}.
	 */
	form: string;
	/**
	 * The forms of the guild, for their menu.
	 */
	forms: readonly { id: string; name: string }[];
	/**
	 * The page, the first being `0`.
	 */
	page: number;
	/**
	 * How many appeals the filter has.
	 */
	total: number;
	rows: readonly AppealListRow[];
}

export interface AppealListRow {
	appeal: Appeal;
	/**
	 * The name of the type of its case, `null` when the case is gone.
	 */
	type: string | null;
}

/**
 * Reads a page of the appeals of a guild, the latest first.
 *
 * @param t - The language of the moderator.
 * @param guildId - The guild.
 * @param filter - What to show.
 * @param form - The form to show, or {@linkcode AppealListAllForms}.
 * @param page - The page, the last one when it is out of range: an appeal can be decided while the list is open.
 */
export async function fetchAppealListPage(
	t: TFunction<AnyNamespace>,
	guildId: Snowflake,
	filter: AppealListFilter,
	form: string,
	page: number
): Promise<AppealListPage> {
	const shown = { status: filter === 'all' ? undefined : filter, formId: form === AppealListAllForms ? undefined : form };
	const total = await countAppeals(container.prisma, guildId, shown);
	const current = Math.min(page, Math.max(0, Math.ceil(total / AppealsPerPage) - 1));

	const appeals = await fetchAppeals(container.prisma, guildId, { ...shown, limit: AppealsPerPage, offset: current * AppealsPerPage });
	const forms = await fetchAppealForms(container.prisma, guildId);
	const moderation = await getModeration(guildId);
	const rows = await Promise.all(
		appeals.map(async (appeal) => {
			const entry = await moderation.fetch(appeal.caseId);
			return { appeal, type: entry === null ? null : getTitle(t, entry) };
		})
	);

	return { t, filter, form, forms: forms.map(({ id, name }) => ({ id: id!, name })), page: current, total, rows };
}

function pageButton(filter: AppealListFilter, form: string, page: number, emoji: EmojiComponent, disabled: boolean): APIButtonComponentWithCustomId {
	return {
		type: ComponentType.Button,
		custom_id: encodeAppealListId({ verb: 'page', filter, form, page }),
		style: ButtonStyle.Secondary,
		emoji,
		disabled
	};
}

/**
 * Renders a page of `/appeal list`: a select menu of what to show, the appeals, and the buttons of the pages when there
 * is more than one.
 */
export function renderAppealList({
	t,
	filter,
	form,
	forms,
	page,
	total,
	rows
}: AppealListPage): Pick<APIInteractionResponseCallbackData, 'components' | 'flags' | 'allowed_mentions'> {
	const pages = Math.max(1, Math.ceil(total / AppealsPerPage));
	const lines = rows.map(({ appeal, type }) =>
		t('commands/appeal:listLine', {
			case: appeal.caseId,
			type: type ?? t('commands/appeal:caseGone'),
			user: userMention(appeal.userId),
			status: t(AppealStatusKeys[appeal.status]),
			time: time(Math.floor(appeal.createdAt / 1000), TimestampStyles.RelativeTime)
		})
	);

	const body: APIComponentInContainer[] = [
		{ type: ComponentType.TextDisplay, content: `## ${Emojis.ModuleAppeals} ${t('commands/appeal:listTitle')}` },
		{
			type: ComponentType.ActionRow,
			components: [
				{
					type: ComponentType.StringSelect,
					custom_id: encodeAppealListId({ verb: 'filter', filter, form, page: 0 }),
					options: AppealListFilters.map((value) => ({
						label: cutText(t(AppealListFilterKeys[value]), 100),
						value,
						default: value === filter
					}))
				}
			]
		},
		...(forms.length === 0
			? []
			: [
					{
						type: ComponentType.ActionRow as const,
						components: [
							{
								type: ComponentType.StringSelect as const,
								custom_id: encodeAppealListId({ verb: 'form', filter, form, page: 0 }),
								options: [{ id: AppealListAllForms, name: t('commands/appeal:formAll') }, ...forms]
									.slice(0, MaximumSelectOptions)
									.map(({ id, name }) => ({
										label: cutText(name, 100),
										value: id,
										default: id === form
									}))
							}
						]
					}
				]),
		{ type: ComponentType.Separator, divider: true, spacing: SeparatorSpacingSize.Small },
		{ type: ComponentType.TextDisplay, content: lines.length === 0 ? t('commands/appeal:listEmpty') : lines.join('\n') }
	];

	if (pages > 1) {
		body.push(
			{ type: ComponentType.TextDisplay, content: `-# ${t('commands/appeal:listFooter', { page: page + 1, pages, total })}` },
			{
				type: ComponentType.ActionRow,
				components: [
					pageButton(filter, form, Math.max(0, page - 1), getEmojiComponent('ArrowLeft'), page === 0),
					pageButton(filter, form, Math.min(pages - 1, page + 1), getEmojiComponent('ArrowRight'), page >= pages - 1)
				]
			}
		);
	}

	return {
		components: [{ type: ComponentType.Container, accent_color: BrandingColors.Primary, components: body }],
		flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		allowed_mentions: { parse: [] }
	};
}
