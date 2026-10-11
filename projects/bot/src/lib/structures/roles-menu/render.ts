import type { Translator } from '#lib/structures/commands/utils';
import { PermissionsBits } from '#utils/bits';
import { BrandingColors } from '#utils/constants';
import { inlineCode, roleMention } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import {
	ButtonStyle,
	ComponentType,
	MessageFlags,
	PermissionFlagsBits,
	SeparatorSpacingSize,
	TextInputStyle,
	type APIActionRowComponent,
	type APIButtonComponentWithCustomId,
	type APIComponentInContainer,
	type APIInteractionResponseCallbackData,
	type APIModalInteractionResponseCallbackData,
	type Snowflake
} from 'discord-api-types/v10';

/**
 * The name of the interaction handler of the roles menu, which is also the first part of its custom IDs.
 */
export const RolesMenuHandlerName = 'roles';

/**
 * What a component of the roles menu does:
 *
 * - `list`: shows a page of the roles, the page is the one to show.
 * - `jump`: opens the modal that asks for a page.
 * - `goto`: the modal of the page.
 * - `pick`: shows the page with the select menu of the roles, the page is the one of the list to go back to.
 * - `select`: the select menu of the roles, the role is its selected value and the page is the one of the list.
 */
export type RolesMenuVerb = 'list' | 'jump' | 'goto' | 'pick' | 'select';

export interface RolesMenuAction {
	/**
	 * The user who opened the menu, the only one that can use it.
	 */
	ownerId: Snowflake;
	verb: RolesMenuVerb;
	page: number;
}

/**
 * Builds the custom ID of a component of the roles menu, `roles.<ownerId>.<verb>:<page>`.
 *
 * @remarks Everything a click needs is in the ID, so the menu keeps working after a restart and on any process.
 */
export function encodeRolesMenuId(action: RolesMenuAction) {
	return encodeCustomId(RolesMenuHandlerName, action.ownerId, `${action.verb}:${action.page}`);
}

const Verbs = new Set<string>(['list', 'jump', 'goto', 'pick', 'select']);

/**
 * Reads what {@linkcode encodeRolesMenuId} wrote from the content the framework parsed out of a custom ID.
 *
 * @returns The action, or `null` when the custom ID is not one of the roles menu.
 */
export function decodeRolesMenuId(content: unknown): RolesMenuAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null) return null;

	const [verb, page] = decoded.action.split(':');
	if (verb === undefined || !Verbs.has(verb) || page === undefined) return null;

	const pageNumber = Number(page);
	if (!Number.isSafeInteger(pageNumber) || pageNumber < 0) return null;

	return { ownerId: decoded.sessionId, verb: verb as RolesMenuVerb, page: pageNumber };
}

/**
 * How many roles a page lists.
 */
export const RolesPerPage = 8;

/**
 * The custom ID of the text input of {@linkcode renderRolesPageModal}.
 */
export const RolesPageInputId = 'page';

/**
 * A role of the server, as the menu shows it.
 */
export interface RolesMenuRole {
	id: Snowflake;
	name: string;
	color: number;
	hoist: boolean;
	mentionable: boolean;
	position: number;
	permissions: bigint;
}

export interface RolesMenuContext {
	/**
	 * The function to translate with.
	 */
	t: Translator;

	/**
	 * The user who opened the menu, the only one that can use it.
	 */
	ownerId: Snowflake;

	/**
	 * The name of the server.
	 */
	guildName: string;

	/**
	 * The roles of the server, `@everyone` included, see {@linkcode sortRoles}.
	 */
	roles: readonly RolesMenuRole[];
}

/**
 * The body of a message of the roles menu, which is made of components only.
 */
export type RolesMenuMessage = Pick<APIInteractionResponseCallbackData, 'components' | 'flags' | 'allowed_mentions'>;

/**
 * Sorts the roles as the server shows them: the highest first.
 */
export function sortRoles(roles: readonly RolesMenuRole[]): RolesMenuRole[] {
	return [...roles].sort((a, b) => b.position - a.position || a.id.localeCompare(b.id));
}

function formatColor(color: number) {
	return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Renders a page of the roles of the server: its title and how many roles it has, the roles of the page numbered with
 * their color and ID, and the navigation with the button that opens the select menu of the roles.
 *
 * @param context - The context of the menu.
 * @param page - The page to render, the last one when it is out of range.
 */
export function renderRolesList(context: RolesMenuContext, page: number): RolesMenuMessage {
	const { t, ownerId, roles } = context;
	const pages = Math.max(1, Math.ceil(roles.length / RolesPerPage));
	const current = Math.min(page, pages - 1);
	const id = (verb: RolesMenuVerb, target = current) => encodeRolesMenuId({ ownerId, verb, page: target });

	const first = current * RolesPerPage;
	const lines = roles
		.slice(first, first + RolesPerPage)
		.map(
			(role, index) => `**${first + index + 1}.** ${roleMention(role.id)}\n-# ${inlineCode(role.id)} · ${inlineCode(formatColor(role.color))}`
		);

	const body: APIComponentInContainer[] = [
		{
			type: ComponentType.TextDisplay,
			content: `## 🏷️ ${t('commands/management:rolesBrowseTitle')}\n${t('commands/management:rolesBrowseSubtitle', { server: context.guildName, count: roles.length })}`
		},
		{ type: ComponentType.Separator, divider: true, spacing: SeparatorSpacingSize.Small },
		{ type: ComponentType.TextDisplay, content: lines.length === 0 ? t('commands/management:rolesBrowseEmpty') : lines.join('\n') },
		{ type: ComponentType.Separator, divider: true, spacing: SeparatorSpacingSize.Small },
		{
			type: ComponentType.TextDisplay,
			content: `-# ${t('commands/management:rolesBrowseFooter', { page: current + 1, total: pages, count: roles.length })}`
		},
		row(
			deduplicate([
				button(id('list', 0), { emoji: '⏮️', disabled: current === 0 }),
				button(id('list', Math.max(0, current - 1)), { emoji: '◀️', disabled: current === 0 }),
				button(id('jump'), { label: '…', disabled: pages === 1 }),
				button(id('list', Math.min(pages - 1, current + 1)), { emoji: '▶️', disabled: current >= pages - 1 }),
				button(id('list', pages - 1), { emoji: '⏭️', disabled: current >= pages - 1 })
			])
		),
		row([button(id('pick'), { label: t('commands/management:rolesBrowsePick'), emoji: '🔎', style: ButtonStyle.Primary })])
	];

	return toMessage([{ type: ComponentType.Container, accent_color: BrandingColors.Primary, components: body }]);
}

/**
 * Renders the page with the select menu of the roles, and nothing else but the button that goes back to the list.
 *
 * @param context - The context of the menu.
 * @param page - The page of the list to go back to.
 */
export function renderRolesPicker(context: RolesMenuContext, page: number): RolesMenuMessage {
	const { t, ownerId } = context;
	const body: APIComponentInContainer[] = [
		{
			type: ComponentType.TextDisplay,
			content: `## 🔎 ${t('commands/management:rolesBrowsePickTitle')}\n${t('commands/management:rolesBrowsePickSubtitle')}`
		},
		{
			type: ComponentType.ActionRow,
			components: [
				{
					type: ComponentType.RoleSelect,
					custom_id: encodeRolesMenuId({ ownerId, verb: 'select', page }),
					placeholder: cutText(t('commands/management:rolesBrowsePickPlaceholder'), 150),
					min_values: 1,
					max_values: 1
				}
			]
		},
		row([button(encodeRolesMenuId({ ownerId, verb: 'list', page }), { label: t('commands/management:rolesBrowseBack'), emoji: '◀️' })])
	];

	return toMessage([{ type: ComponentType.Container, accent_color: BrandingColors.Primary, components: body }]);
}

/**
 * Renders a role: what it is, what it can do, and the buttons that go back to the list or pick another role.
 *
 * @param context - The context of the menu.
 * @param role - The role to render.
 * @param page - The page of the list to go back to.
 */
export function renderRoleView(context: RolesMenuContext, role: RolesMenuRole, page: number): RolesMenuMessage {
	const { t, ownerId } = context;
	const administrator = PermissionsBits.has(role.permissions, PermissionFlagsBits.Administrator);
	const permissions = administrator
		? t('commands/management:roleInfoAll')
		: role.permissions > 0n
			? PermissionsBits.toArray(role.permissions)
					.map((name) => `+ ${t(`permissions:${name}` as never)}`)
					.join('\n')
			: t('commands/management:roleInfoNoPermissions');

	const description = t('commands/management:roleInfoData', {
		role: { id: role.id, name: role.name, hexColor: formatColor(role.color), rawPosition: role.position },
		hoisted: t(role.hoist ? 'globals:yes' : 'globals:no'),
		mentionable: t(role.mentionable ? 'globals:yes' : 'globals:no')
	});

	const body: APIComponentInContainer[] = [
		{ type: ComponentType.TextDisplay, content: `## ${roleMention(role.id)}\n${description}` },
		{ type: ComponentType.Separator, divider: true, spacing: SeparatorSpacingSize.Small },
		{
			type: ComponentType.TextDisplay,
			content: cutText(`**${t('commands/management:roleInfoTitles.PERMISSIONS' as never)}**\n${permissions}`, 3500)
		},
		row([
			button(encodeRolesMenuId({ ownerId, verb: 'list', page }), { label: t('commands/management:rolesBrowseBack'), emoji: '◀️' }),
			button(encodeRolesMenuId({ ownerId, verb: 'pick', page }), {
				label: t('commands/management:rolesBrowsePick'),
				emoji: '🔎',
				style: ButtonStyle.Primary
			})
		])
	];

	return toMessage([{ type: ComponentType.Container, accent_color: role.color || BrandingColors.Secondary, components: body }]);
}

/**
 * The modal a user writes the page they want to go to in.
 *
 * @param t - The function to translate with.
 * @param ownerId - The user who opened the menu.
 */
export function renderRolesPageModal(t: Translator, ownerId: Snowflake): APIModalInteractionResponseCallbackData {
	return {
		custom_id: encodeRolesMenuId({ ownerId, verb: 'goto', page: 0 }),
		title: cutText(t('commands/management:rolesBrowseGotoTitle'), 45),
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.TextInput,
						custom_id: RolesPageInputId,
						label: cutText(t('commands/management:rolesBrowseGotoLabel'), 45),
						placeholder: cutText(t('commands/management:rolesBrowseGotoPlaceholder'), 100),
						style: TextInputStyle.Short,
						required: true,
						min_length: 1,
						max_length: 5
					}
				]
			}
		]
	};
}

function toMessage(components: NonNullable<RolesMenuMessage['components']>): RolesMenuMessage {
	return { components, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, allowed_mentions: { parse: [] } };
}

function row(components: APIButtonComponentWithCustomId[]): APIActionRowComponent<APIButtonComponentWithCustomId> {
	return { type: ComponentType.ActionRow, components };
}

interface ButtonOptions {
	label?: string;
	emoji?: string;
	style?: APIButtonComponentWithCustomId['style'];
	disabled?: boolean;
}

function button(customId: string, options: ButtonOptions): APIButtonComponentWithCustomId {
	return {
		type: ComponentType.Button,
		custom_id: customId,
		style: options.style ?? ButtonStyle.Secondary,
		...(options.label === undefined ? {} : { label: cutText(options.label, 80) }),
		...(options.emoji === undefined ? {} : { emoji: { name: options.emoji } }),
		...(options.disabled ? { disabled: true } : {})
	};
}

/**
 * Makes the custom IDs of the buttons unique, by numbering the ones that repeat an ID: the first and the previous page
 * are both the first one on the second page, and the handler only reads the first two parts of an ID.
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
