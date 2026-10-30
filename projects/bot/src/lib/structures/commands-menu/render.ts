import { Emojis, getEmojiComponent, type EmojiComponent, type EmojiKey } from '#utils/emojis';
import { GuildMessageChannelTypes } from '#utils/channelTypes';
import type { Translator } from '#lib/structures/commands/utils';
import {
	CommandQueryMaximumLength,
	getCommandCategories,
	listCatalogEntries,
	searchCatalogEntries,
	type CatalogCommand,
	type CatalogEntry
} from '#lib/structures/commands-menu/catalog';
import {
	CommandChannelLists,
	CommandMemberRules,
	listCommandMembers,
	MaximumCommandRestrictionEntries,
	type CommandMemberRule,
	type CommandRestriction
} from '#lib/structures/commands-menu/restrictions';
import { chatInputApplicationCommandMention, inlineCode } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import {
	ButtonStyle,
	ChannelType,
	ComponentType,
	SelectMenuDefaultValueType,
	MessageFlags,
	PermissionFlagsBits,
	TextInputStyle,
	type APIActionRowComponent,
	type APILabelComponent,
	type APIButtonComponentWithCustomId,
	type APIComponentInContainer,
	type APIInteractionResponseCallbackData,
	type APIMessageTopLevelComponent,
	type APIModalInteractionResponseCallbackData,
	type APISelectMenuOption,
	type APIStringSelectComponent,
	type APITextDisplayComponent,
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
 * - `edit`: opens the editor of a command, the target is the path of its entry, `whois user`.
 * - `editGroup`: opens the editor of the rules of a group of commands: the target is `*` or `Category.*` for the button
 *   of a list, and the category for the select menu of its sub-categories, whose value is the sub-category.
 * - `legacy`: downloads preserved nodes; `clearLegacy`, `confirmLegacy` remove them with owner confirmation.
 * - `save`: the modal of a command or of a group, the target is its name or the group (`Category.*`).
 * - `search`: opens the modal of the search.
 * - `query`: the modal of the search.
 * - `results`: shows a page of the results of a search, the target is the query.
 * - `jump`: opens the modal that asks for a page, the target is the list it is in, `list/Tools` or `results/ban`.
 * - `goto`: the modal of the page, with the same target as `jump`.
 */
export type CommandsMenuVerb =
	| 'list'
	| 'category'
	| 'edit'
	| 'editGroup'
	| 'save'
	| 'search'
	| 'query'
	| 'results'
	| 'jump'
	| 'goto'
	| 'legacy'
	| 'clearLegacy'
	| 'confirmLegacy';

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
	// A custom ID cannot hold the `.` of a group (`Moderation.*`), which no command, category nor query has a `~` for:
	const target = action.target.replaceAll('.', '~');
	return encodeCustomId(CommandsMenuHandlerName, action.ownerId, `${action.verb}:${target}:${action.page}`);
}

const Verbs = new Set<string>([
	'list',
	'category',
	'edit',
	'editGroup',
	'save',
	'search',
	'query',
	'results',
	'jump',
	'goto',
	'legacy',
	'clearLegacy',
	'confirmLegacy'
]);

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

	return { ownerId: decoded.sessionId, verb: verb as CommandsMenuVerb, target: target.replaceAll('~', '.'), page: pageNumber };
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

const CategoryEmojis: Record<string, EmojiKey> = {
	[AllCategoriesValue]: 'CategoryAll',
	Admin: 'CategoryAdmin',
	General: 'CategoryGeneral',
	Management: 'CategoryManagement',
	Moderation: 'CategoryModeration',
	Tools: 'CategoryTools'
};

/**
 * Gets the emoji of a category for its option of the select menu, a folder for one that has none.
 */
function getCategoryEmoji(category: string): EmojiComponent {
	const key = CategoryEmojis[category];
	return key === undefined ? { name: '📁' } : getEmojiComponent(key);
}

/**
 * Writes the emoji of a category in a text, see {@linkcode getCategoryEmoji}.
 */
function formatCategoryEmoji(category: string): string {
	const key = CategoryEmojis[category];
	return key === undefined ? '📁' : Emojis[key];
}

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
	/** Only administrators see the notice about preserved legacy rules. */
	hasLegacyPermissions?: boolean;
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
			emoji: getCategoryEmoji(AllCategoriesValue),
			default: current === ''
		},
		...categories.map((entry) => ({
			label: entry.name,
			description: t('commands/commands:menuCount', { count: entry.count }),
			value: entry.name,
			emoji: getCategoryEmoji(entry.name),
			default: entry.name === current
		}))
	];

	return renderPage(context, {
		subtitle: t('commands/commands:menuSubtitle'),
		title: `${formatCategoryEmoji(current === '' ? AllCategoriesValue : current)} ${current === '' ? t('commands/commands:menuAllCommands') : current}`,
		entries,
		page,
		verb: 'list',
		target: current,
		group: current === '' ? '*' : `${current}.*`,
		subCategories:
			current === ''
				? undefined
				: {
						category: current,
						names: [
							...new Set(
								context.commands
									.filter((command) => command.category === current && command.subCategory !== null)
									.map((command) => command.subCategory!)
							)
						].sort()
					},
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
	/** The group whose rules the title edits, `*` or `Category.*`; none for the results of a search. */
	group?: string;
	/** The sub-categories of the category of the list, which a select menu edits the rules of. */
	subCategories?: { category: string; names: readonly string[] };
}

function renderPage(context: CommandsMenuContext, options: PageOptions): CommandsMenuMessage {
	const { t, ownerId } = context;
	const pages = Math.max(1, Math.ceil(options.entries.length / CommandsPerPage));
	const current = Math.min(options.page, pages - 1);
	const id = (verb: CommandsMenuVerb, target: string, page = current) => encodeCommandsMenuId({ ownerId, verb, target, page });

	const header: APIComponentInContainer[] = [
		{
			type: ComponentType.Section,
			components: [{ type: ComponentType.TextDisplay, content: `## ⌘ ${t('commands/commands:menuTitle')}\n${options.subtitle}` }],
			accessory: button(id('search', ''), { emoji: '🔍' })
		}
	];
	if (context.hasLegacyPermissions)
		header.push({
			type: ComponentType.Section,
			components: [{ type: ComponentType.TextDisplay, content: t('commands/commands:legacyNotice') }],
			accessory: button(id('legacy', ''), { label: t('commands/commands:legacyReview') })
		});
	if (options.select !== undefined) header.push({ type: ComponentType.ActionRow, components: [options.select] });

	const first = current * CommandsPerPage;
	const title: APITextDisplayComponent = { type: ComponentType.TextDisplay, content: `## ${options.title}` };
	const body: APIComponentInContainer[] = [
		options.group === undefined
			? title
			: {
					type: ComponentType.Section,
					components: [title],
					accessory: button(id('editGroup', options.group, 0), {
						label: t(options.group === '*' ? 'commands/commands:editAllButton' : 'commands/commands:editGroupButton')
					})
				}
	];
	if (options.subCategories !== undefined && options.subCategories.names.length > 0) {
		body.push({
			type: ComponentType.ActionRow,
			components: [
				{
					type: ComponentType.StringSelect,
					custom_id: id('editGroup', options.subCategories.category, 0),
					placeholder: cutText(t('commands/commands:editSubCategoryPlaceholder'), 150),
					options: options.subCategories.names.slice(0, 25).map((name) => ({ label: name, value: name }))
				}
			]
		});
	}
	body.push({ type: ComponentType.Separator });
	for (const [index, entry] of options.entries.slice(first, first + CommandsPerPage).entries()) {
		body.push({
			type: ComponentType.Section,
			components: [
				{
					type: ComponentType.TextDisplay,
					content: `**${first + index + 1}. ${mentionCommand(context, entry.command, entry.subcommand ?? undefined)}**\n-# ${cutText(entry.description, 150)}`
				}
			],
			accessory: button(id('edit', entry.path), { emoji: getEmojiComponent('Edit') })
		});
	}

	if (options.entries.length === 0) body.push({ type: ComponentType.TextDisplay, content: options.empty });

	const navigation: APIButtonComponentWithCustomId[] = [
		button(id(options.verb, options.target, 0), { emoji: getEmojiComponent('ArrowLeftFast'), disabled: current === 0 }),
		button(id(options.verb, options.target, Math.max(0, current - 1)), { emoji: getEmojiComponent('ArrowLeft'), disabled: current === 0 }),
		button(id('jump', `${options.verb}/${options.target}`), { label: '…', disabled: pages === 1 }),
		button(id(options.verb, options.target, Math.min(pages - 1, current + 1)), {
			emoji: getEmojiComponent('ArrowRight'),
			disabled: current >= pages - 1
		}),
		button(id(options.verb, options.target, pages - 1), { emoji: getEmojiComponent('ArrowRightFast'), disabled: current >= pages - 1 })
	];

	body.push(
		{ type: ComponentType.Separator },
		{
			type: ComponentType.TextDisplay,
			content: `-# ${t('commands/commands:menuFooter', { page: current + 1, total: pages, count: options.entries.length })}`
		},
		row(deduplicate(navigation))
	);
	if (options.back) body.push(row([button(id('list', '', 0), { label: t('commands/commands:menuBack'), emoji: getEmojiComponent('Back') })]));

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
 */
export function renderCommand(context: CommandsMenuContext, command: CatalogCommand): CommandsMenuMessage {
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
			button(encodeCommandsMenuId({ ownerId, verb: 'list', target: command.category, page: 0 }), {
				label: t('commands/commands:menuBack'),
				emoji: getEmojiComponent('Back')
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
 * The value of the option of the status radio group that enables a command.
 */
export const CommandEnabledValue = 'enabled';

/**
 * The value of the option of the status radio group that disables a command.
 */
export const CommandDisabledValue = 'disabled';

/**
 * The custom ID of the radio group of {@linkcode renderCommandEditModal}. The select menus of the channels have the name
 * of their list, see `CommandChannelLists`, and the ones of the members `allowedMembers` and `ignoredMembers`, see
 * {@linkcode getCommandMembersInputId}.
 */
export const CommandStatusInputId = 'status';

/**
 * The custom ID of the select menu that holds the roles and the users of a rule.
 */
export function getCommandMembersInputId(rule: CommandMemberRule) {
	return `${rule}Members` as const;
}

/**
 * The modal that edits a command of the server: whether it can be run, the channels it is allowed in or ignores, and
 * the roles and the users that are allowed or ignored, which fill the five fields a modal holds.
 *
 * @param context - The context of the menu.
 * @param command - The command to edit.
 * @param disabledBy - The name in `commands.disabled` that disables it, `null` when it is enabled.
 * @param restriction - The channels, the roles and the users the server restricts the command to.
 * @param revision - The revision of the command the modal is opened with, see `getCommandRestrictionRevision`.
 * @param inherited - The broader targets whose rules apply to the command too (`Moderation.*`, `*`), most specific first.
 */
export function renderCommandEditModal(
	context: CommandsMenuContext,
	command: CatalogCommand,
	disabledBy: string | null,
	restriction: CommandRestriction,
	revision: number,
	inherited: readonly string[] = []
): APIModalInteractionResponseCallbackData {
	const { t } = context;
	// A command that is disabled by its category, or by `*`, says so, since enabling it here does not undo that; then
	// the rules of a group that apply to it too, which this modal does not show:
	const status =
		disabledBy !== null && disabledBy !== command.name
			? t('commands/commands:editStatusDisabledBy', { rule: disabledBy })
			: inherited.length > 0
				? t('commands/commands:editStatusInherited', { targets: inherited.join(', ') })
				: command.subcommands.length > 0
					? t('commands/commands:editStatusSubcommands', { count: command.subcommands.length })
					: t('commands/commands:editStatusDescription');

	return renderRuleModal(context, {
		target: command.name,
		title: t('commands/commands:editTitle', { name: command.name }),
		status,
		disabled: disabledBy !== null,
		restriction,
		revision
	});
}

/**
 * The modal that edits the rules of a group of commands, every command (`*`), a category (`Category.*`) or a
 * sub-category (`Category.SubCategory.*`), with the same five fields as the modal of a command.
 *
 * @param context - The context of the menu.
 * @param target - The group.
 * @param disabled - Whether `commands.disabled` has the group.
 * @param restriction - The rule of the group.
 * @param revision - The revision the modal is opened with, see `getCommandRestrictionRevision`.
 */
export function renderGroupRuleModal(
	context: CommandsMenuContext,
	target: string,
	disabled: boolean,
	restriction: CommandRestriction,
	revision: number
): APIModalInteractionResponseCallbackData {
	const { t } = context;
	return renderRuleModal(context, {
		target,
		title: t('commands/commands:editGroupTitle', { target }),
		status: t('commands/commands:editGroupStatusDescription'),
		disabled,
		restriction,
		revision
	});
}

interface RuleModalOptions {
	target: string;
	title: string;
	status: string;
	disabled: boolean;
	restriction: CommandRestriction;
	revision: number;
}

function renderRuleModal(context: CommandsMenuContext, options: RuleModalOptions): APIModalInteractionResponseCallbackData {
	const { t } = context;
	const { restriction } = options;
	const common = { required: false, min_values: 0, max_values: MaximumCommandRestrictionEntries };
	const channels = (list: (typeof CommandChannelLists)[number]): APILabelComponent => ({
		type: ComponentType.Label,
		label: cutText(t(`commands/commands:edit${RestrictionKeys[list]}Label`), 45),
		description: cutText(t(`commands/commands:edit${RestrictionKeys[list]}Description`), 100),
		component: {
			...common,
			custom_id: list,
			type: ComponentType.ChannelSelect,
			// Restrictions also match a thread's parent, including forum and media posts. Categories are not inherited recursively.
			channel_types: [...GuildMessageChannelTypes, ChannelType.GuildForum, ChannelType.GuildMedia],
			default_values: restriction[list]
				.slice(0, MaximumCommandRestrictionEntries)
				.map((id) => ({ id, type: SelectMenuDefaultValueType.Channel }))
		}
	});
	const members = (rule: CommandMemberRule): APILabelComponent => ({
		type: ComponentType.Label,
		label: cutText(t(`commands/commands:edit${rule === 'allowed' ? 'Allowed' : 'Ignored'}MembersLabel`), 45),
		description: cutText(t(`commands/commands:edit${rule === 'allowed' ? 'Allowed' : 'Ignored'}MembersDescription`), 100),
		component: {
			...common,
			custom_id: getCommandMembersInputId(rule),
			type: ComponentType.MentionableSelect,
			default_values: listCommandMembers(restriction, rule)
				.slice(0, MaximumCommandRestrictionEntries)
				.map(({ id, type }) => ({ id, type: type === 'role' ? SelectMenuDefaultValueType.Role : SelectMenuDefaultValueType.User }))
		}
	});

	return {
		// The modal carries the revision where the other actions carry their page:
		custom_id: encodeCommandsMenuId({ ownerId: context.ownerId, verb: 'save', target: options.target, page: options.revision }),
		title: cutText(options.title, 45),
		components: [
			{
				type: ComponentType.Label,
				label: cutText(t('commands/commands:editStatusLabel'), 45),
				description: cutText(options.status, 100),
				component: {
					type: ComponentType.RadioGroup,
					custom_id: CommandStatusInputId,
					required: true,
					options: [
						{ value: CommandEnabledValue, label: t('commands/commands:editEnabled'), default: !options.disabled },
						{ value: CommandDisabledValue, label: t('commands/commands:editDisabled'), default: options.disabled }
					]
				}
			},
			...CommandChannelLists.map(channels),
			...CommandMemberRules.map(members)
		]
	};
}

/** Removing legacy rules is an explicit owner action, after downloading their backup. */
export function renderClearLegacyModal(
	context: Pick<CommandsMenuContext, 't' | 'ownerId'>,
	revision: number
): APIModalInteractionResponseCallbackData {
	return {
		custom_id: encodeCommandsMenuId({ ownerId: context.ownerId, verb: 'confirmLegacy', target: '', page: revision }),
		title: context.t('commands/commands:legacyRemove'),
		components: [
			{
				type: ComponentType.Label,
				label: context.t('commands/commands:legacyConfirmLabel'),
				description: context.t('commands/commands:legacyConfirmDescription'),
				component: {
					type: ComponentType.TextInput,
					custom_id: 'confirmation',
					style: TextInputStyle.Short,
					required: true,
					min_length: 6,
					max_length: 6
				}
			}
		]
	};
}

export function renderLegacyPermissionButtons(
	context: Pick<CommandsMenuContext, 't' | 'ownerId'>,
	revision: number
): APIActionRowComponent<APIButtonComponentWithCustomId> {
	return row([
		button(encodeCommandsMenuId({ ownerId: context.ownerId, verb: 'clearLegacy', target: '', page: revision }), {
			label: context.t('commands/commands:legacyRemove'),
			style: ButtonStyle.Danger
		})
	]);
}

/**
 * The part of the keys of the texts of each list of channels of a restriction.
 */
const RestrictionKeys = {
	allowedChannels: 'AllowedChannels',
	ignoredChannels: 'IgnoredChannels'
} as const satisfies Record<(typeof CommandChannelLists)[number], string>;

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

	/**
	 * A Unicode emoji, or one of the bot, see `getEmojiComponent`.
	 */
	emoji?: string | EmojiComponent;
	style?: APIButtonComponentWithCustomId['style'];
	disabled?: boolean;
}

function button(customId: string, options: ButtonOptions): APIButtonComponentWithCustomId {
	return {
		type: ComponentType.Button,
		custom_id: customId,
		style: options.style ?? ButtonStyle.Secondary,
		...(options.label === undefined ? {} : { label: cutText(options.label, 80) }),
		...(options.emoji === undefined ? {} : { emoji: typeof options.emoji === 'string' ? { name: options.emoji } : options.emoji }),
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
