import type { Translator } from '#lib/structures/commands/utils';
import {
	CommandQueryMaximumLength,
	getCommandCategories,
	listCatalogEntries,
	searchCatalogEntries,
	type CatalogCommand,
	type CatalogEntry
} from '#lib/structures/commands-menu/catalog';
import { chatInputApplicationCommandMention, inlineCode } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import {
	ButtonStyle,
	ComponentType,
	MessageFlags,
	PermissionFlagsBits,
	TextInputStyle,
	type APIActionRowComponent,
	type APIButtonComponentWithCustomId,
	type APIComponentInContainer,
	type APIInteractionResponseCallbackData,
	type APIMessageTopLevelComponent,
	type APIModalInteractionResponseCallbackData,
	type APISelectMenuOption,
	type APIStringSelectComponent,
	type Snowflake
} from 'discord-api-types/v10';

/**
 * The name of the interaction handler of the commands menu, which is also the first part of its custom IDs.
 */
export const CommandsMenuHandlerName = 'commands';

/**
 * What a component of the commands menu does:
 *
 * - `list`: shows a page of a category, the target is the category, empty for every command.
 * - `category`: the category select menu, the category is its selected value.
 * - `view`: shows a command, the target is the category the list was in and the path of the entry, `Tools/whois user`.
 * - `search`: opens the modal of the search.
 * - `query`: the modal of the search.
 * - `results`: shows a page of the results of a search, the target is the query.
 * - `jump`: opens the modal that asks for a page, the target is the list it is in, `list/Tools` or `results/ban`.
 * - `goto`: the modal of the page, with the same target as `jump`.
 */
export type CommandsMenuVerb = 'list' | 'category' | 'view' | 'search' | 'query' | 'results' | 'jump' | 'goto';

export interface CommandsMenuAction {
	/**
	 * The user who opened the menu, the only one that can use it.
	 */
	ownerId: Snowflake;
	verb: CommandsMenuVerb;
	target: string;
	page: number;
}

/**
 * Builds the custom ID of a component of the commands menu, `commands.<ownerId>.<verb>:<target>:<page>`.
 *
 * @remarks Everything a click needs is in the ID, so the menu keeps working after a restart and on any process.
 */
export function encodeCommandsMenuId(action: CommandsMenuAction) {
	return encodeCustomId(CommandsMenuHandlerName, action.ownerId, `${action.verb}:${action.target}:${action.page}`);
}

const Verbs = new Set<string>(['list', 'category', 'view', 'search', 'query', 'results', 'jump', 'goto']);

/**
 * Reads what {@linkcode encodeCommandsMenuId} wrote from the content the framework parsed out of a custom ID.
 *
 * @returns The action, or `null` when the custom ID is not one of the commands menu.
 */
export function decodeCommandsMenuId(content: unknown): CommandsMenuAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null) return null;

	const [verb, target, page] = decoded.action.split(':');
	if (verb === undefined || !Verbs.has(verb) || target === undefined || page === undefined) return null;

	const pageNumber = Number(page);
	if (!Number.isSafeInteger(pageNumber) || pageNumber < 0) return null;

	return { ownerId: decoded.sessionId, verb: verb as CommandsMenuVerb, target, page: pageNumber };
}

/**
 * How many commands a page shows. A message holds 40 components, and every command takes three of them (the section,
 * its text and its button) on top of the ones the rest of the menu takes, which are 17.
 */
const CommandsPerPage = 5;

const AccentColor = 0x5865f2;

/**
 * The value of the option of the category select menu that shows every command.
 */
export const AllCategoriesValue = '-';

/**
 * The custom ID of the text input of {@linkcode renderCommandsSearchModal}.
 */
export const CommandsSearchInputId = 'query';

/**
 * The custom ID of the text input of {@linkcode renderCommandsPageModal}.
 */
export const CommandsPageInputId = 'page';

const CategoryEmojis: Record<string, string> = {
	[AllCategoriesValue]: '📋',
	Admin: '⚙️',
	General: '🧭',
	Management: '🛠️',
	Moderation: '🔨',
	Tools: '🧰'
};

export interface CommandsMenuContext {
	/**
	 * The function to translate with.
	 */
	t: Translator;

	/**
	 * The user who opened the menu, the only one that can use it.
	 */
	ownerId: Snowflake;

	/**
	 * The commands of the bot, see `getCommandCatalog`.
	 */
	commands: readonly CatalogCommand[];

	/**
	 * The IDs Discord gave the commands, by name, see `fetchCommandIds`.
	 */
	ids: ReadonlyMap<string, Snowflake>;
}

/**
 * The body of a message of the commands menu, which is made of components only.
 */
export type CommandsMenuMessage = Pick<APIInteractionResponseCallbackData, 'components' | 'flags' | 'allowed_mentions'>;

/**
 * Renders a page of a category: the category select menu and the search, then the commands of the category, one for
 * every command that can be run (a subcommand is listed by itself), each with the button that shows it, and the
 * navigation.
 *
 * @param context - The context of the menu.
 * @param category - The category to render, empty for every command. A category the bot does not have shows them all.
 * @param page - The page to render, the last one when it is out of range.
 */
export function renderCommandsList(context: CommandsMenuContext, category: string, page: number): CommandsMenuMessage {
	const { t } = context;
	const categories = getCommandCategories(context.commands);
	const current = categories.some((entry) => entry.name === category) ? category : '';
	const entries = listCatalogEntries(current === '' ? context.commands : context.commands.filter((command) => command.category === current));

	const options: APISelectMenuOption[] = [
		{
			label: t('commands/commands:menuAllCommands'),
			description: t('commands/commands:menuCount', { count: context.commands.length }),
			value: AllCategoriesValue,
			emoji: { name: CategoryEmojis[AllCategoriesValue] },
			default: current === ''
		},
		...categories.map((entry) => ({
			label: entry.name,
			description: t('commands/commands:menuCount', { count: entry.count }),
			value: entry.name,
			emoji: { name: CategoryEmojis[entry.name] ?? '📁' },
			default: entry.name === current
		}))
	];

	return renderPage(context, {
		subtitle: t('commands/commands:menuSubtitle'),
		title: `${CategoryEmojis[current === '' ? AllCategoriesValue : current] ?? '📁'} ${current === '' ? t('commands/commands:menuAllCommands') : current}`,
		entries,
		page,
		verb: 'list',
		target: current,
		select: {
			type: ComponentType.StringSelect,
			custom_id: encodeCommandsMenuId({ ownerId: context.ownerId, verb: 'category', target: '', page: 0 }),
			placeholder: cutText(t('commands/commands:menuCategoryPlaceholder'), 150),
			options
		},
		empty: t('commands/commands:menuEmpty')
	});
}

/**
 * Renders a page of the results of a search.
 *
 * @param context - The context of the menu.
 * @param query - The query, normalized with `normalizeCommandQuery`.
 * @param page - The page to render, the last one when it is out of range.
 */
export function renderCommandsResults(context: CommandsMenuContext, query: string, page: number): CommandsMenuMessage {
	const { t } = context;
	const entries = searchCatalogEntries(listCatalogEntries(context.commands), query);
	return renderPage(context, {
		subtitle: t('commands/commands:menuResults', { count: entries.length, query: inlineCode(query) }),
		title: `🔍 ${t('commands/commands:menuSearchResults')}`,
		entries,
		page,
		verb: 'results',
		target: query,
		empty: t('commands/commands:menuNoResults'),
		back: true
	});
}

interface PageOptions {
	subtitle: string;
	title: string;
	entries: readonly CatalogEntry[];
	page: number;
	verb: 'list' | 'results';
	target: string;
	select?: APIStringSelectComponent;
	empty: string;
	back?: boolean;
}

function renderPage(context: CommandsMenuContext, options: PageOptions): CommandsMenuMessage {
	const { t, ownerId } = context;
	const pages = Math.max(1, Math.ceil(options.entries.length / CommandsPerPage));
	const current = Math.min(options.page, pages - 1);
	const id = (verb: CommandsMenuVerb, target: string, page = current) => encodeCommandsMenuId({ ownerId, verb, target, page });
	const category = options.verb === 'list' ? options.target : '';

	const header: APIComponentInContainer[] = [
		{
			type: ComponentType.Section,
			components: [{ type: ComponentType.TextDisplay, content: `## ⌘ ${t('commands/commands:menuTitle')}\n${options.subtitle}` }],
			accessory: button(id('search', ''), { emoji: '🔍' })
		}
	];
	if (options.select !== undefined) header.push({ type: ComponentType.ActionRow, components: [options.select] });

	const first = current * CommandsPerPage;
	const body: APIComponentInContainer[] = [{ type: ComponentType.TextDisplay, content: `## ${options.title}` }, { type: ComponentType.Separator }];
	for (const [index, entry] of options.entries.slice(first, first + CommandsPerPage).entries()) {
		body.push({
			type: ComponentType.Section,
			components: [
				{
					type: ComponentType.TextDisplay,
					content: `**${first + index + 1}. ${mentionCommand(context, entry.command, entry.subcommand ?? undefined)}**\n${cutText(entry.description, 150)}`
				}
			],
			accessory: button(id('view', `${category}/${entry.path}`), { emoji: '✏️' })
		});
	}

	if (options.entries.length === 0) body.push({ type: ComponentType.TextDisplay, content: options.empty });

	const navigation: APIButtonComponentWithCustomId[] = [
		button(id(options.verb, options.target, 0), { emoji: '⏮️', disabled: current === 0 }),
		button(id(options.verb, options.target, Math.max(0, current - 1)), { emoji: '◀️', disabled: current === 0 }),
		button(id('jump', `${options.verb}/${options.target}`), { label: '…', disabled: pages === 1 }),
		button(id(options.verb, options.target, Math.min(pages - 1, current + 1)), { emoji: '▶️', disabled: current >= pages - 1 }),
		button(id(options.verb, options.target, pages - 1), { emoji: '⏭️', disabled: current >= pages - 1 })
	];

	body.push(
		{ type: ComponentType.Separator },
		{
			type: ComponentType.TextDisplay,
			content: `-# ${t('commands/commands:menuFooter', { page: current + 1, total: pages, count: options.entries.length })}`
		},
		row(deduplicate(navigation))
	);
	if (options.back) body.push(row([button(id('list', '', 0), { label: t('commands/commands:menuBack'), emoji: '◀️' })]));

	return toMessage([
		{ type: ComponentType.Container, accent_color: AccentColor, components: header },
		{ type: ComponentType.Container, accent_color: AccentColor, components: body }
	]);
}

/**
 * Renders a command: what it does, its subcommands, the context menu commands it comes with, and the permissions
 * Discord asks of a member to show it.
 *
 * @param context - The context of the menu.
 * @param command - The command to render.
 * @param back - The category and the page of the list the command was shown from, which the button that goes back returns to.
 */
export function renderCommand(
	context: CommandsMenuContext,
	command: CatalogCommand,
	back: { category: string; page: number } = { category: command.category, page: 0 }
): CommandsMenuMessage {
	const { t, ownerId } = context;
	const lines = [
		`## ${mentionCommand(context, command)} · ${command.category}`,
		command.description,
		'',
		t('commands/commands:viewPermissions', {
			permissions: command.permissions === null ? t('commands/commands:viewPermissionsNone') : formatPermissions(t, command.permissions)
		})
	];
	if (command.contextMenus.length > 0) {
		lines.push(t('commands/commands:viewContextMenus', { names: command.contextMenus.map((name) => inlineCode(name)).join(', ') }));
	}

	const body: APIComponentInContainer[] = [{ type: ComponentType.TextDisplay, content: lines.join('\n') }];
	if (command.subcommands.length > 0) {
		const subcommands = command.subcommands.map(
			(subcommand) => `${mentionCommand(context, command, subcommand.name)}\n-# ${cutText(subcommand.description, 110)}`
		);
		body.push(
			{ type: ComponentType.Separator },
			{
				type: ComponentType.TextDisplay,
				content: cutText(`### ${t('commands/commands:viewSubcommands', { count: subcommands.length })}\n${subcommands.join('\n')}`, 3500)
			}
		);
	}

	body.push(
		{ type: ComponentType.Separator },
		row([
			button(encodeCommandsMenuId({ ownerId, verb: 'list', target: back.category, page: back.page }), {
				label: t('commands/commands:menuBack'),
				emoji: '◀️'
			}),
			button(encodeCommandsMenuId({ ownerId, verb: 'search', target: '', page: 0 }), {
				emoji: '🔍',
				style: ButtonStyle.Primary
			})
		])
	);

	return toMessage([{ type: ComponentType.Container, accent_color: AccentColor, components: body }]);
}

/**
 * The modal a user writes what they search for in.
 *
 * @param t - The function to translate with.
 * @param ownerId - The user who opened the menu.
 */
export function renderCommandsSearchModal(t: Translator, ownerId: Snowflake): APIModalInteractionResponseCallbackData {
	return {
		custom_id: encodeCommandsMenuId({ ownerId, verb: 'query', target: '', page: 0 }),
		title: cutText(t('commands/commands:searchTitle'), 45),
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.TextInput,
						custom_id: CommandsSearchInputId,
						label: cutText(t('commands/commands:searchLabel'), 45),
						style: TextInputStyle.Short,
						required: true,
						min_length: 1,
						max_length: CommandQueryMaximumLength
					}
				]
			}
		]
	};
}

/**
 * The modal a user writes the page they want to go to in.
 *
 * @param t - The function to translate with.
 * @param ownerId - The user who opened the menu.
 * @param target - The list the page is of, `list/Tools` or `results/ban`.
 */
export function renderCommandsPageModal(t: Translator, ownerId: Snowflake, target: string): APIModalInteractionResponseCallbackData {
	return {
		custom_id: encodeCommandsMenuId({ ownerId, verb: 'goto', target, page: 0 }),
		title: cutText(t('commands/commands:gotoTitle'), 45),
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.TextInput,
						custom_id: CommandsPageInputId,
						label: cutText(t('commands/commands:gotoLabel'), 45),
						placeholder: cutText(t('commands/commands:gotoPlaceholder'), 100),
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

/**
 * Mentions a command, or one of its subcommands, so a click writes it. A command Discord gave no ID for, and one that
 * only has subcommands (which cannot be run by itself), is written as text.
 */
function mentionCommand(context: CommandsMenuContext, command: CatalogCommand, subcommand?: string): string {
	const id = context.ids.get(command.name);
	const path = subcommand === undefined ? command.name : `${command.name} ${subcommand}`;
	if (id === undefined || (subcommand === undefined && command.subcommands.length > 0)) return inlineCode(`/${path}`);

	// The mention of a subcommand takes its path as it is written, group included:
	return chatInputApplicationCommandMention(path, id);
}

function formatPermissions(t: Translator, permissions: bigint): string {
	const names = Object.entries(PermissionFlagsBits)
		.filter(([, bit]) => (permissions & bit) === bit)
		.map(([name]) => inlineCode(t(`permissions:${name}` as never)));
	return names.length === 0 ? t('commands/commands:viewPermissionsNone') : names.join(', ');
}

function toMessage(components: APIMessageTopLevelComponent[]): CommandsMenuMessage {
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
 * Makes the custom IDs of the buttons unique, by numbering the ones that repeat an ID: the first and the previous
 * page are both the first one on the second page, and the handler only reads the first three parts of an ID.
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
