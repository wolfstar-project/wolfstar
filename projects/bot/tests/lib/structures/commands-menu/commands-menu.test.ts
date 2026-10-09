import {
	decodeCommandsMenuId,
	encodeCommandsMenuId,
	getCommandCategories,
	listCatalogEntries,
	normalizeCommandQuery,
	renderCommand,
	renderCommandEditModal,
	renderCommandsList,
	renderCommandsPageModal,
	renderCommandsResults,
	renderCommandsSearchModal,
	searchCatalogEntries,
	toCatalogCommand,
	type CatalogCommand,
	type CommandsMenuContext
} from '#lib/structures/commands-menu';
import { ApplicationCommandOptionType, ComponentType, MessageFlags } from 'discord-api-types/v10';

const ownerId = '266624760782258186';

// Echoes the key and its options, the translations are not what is tested here:
const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)) as never;

function createCommand(name: string, category: string, overrides: Partial<CatalogCommand> = {}): CatalogCommand {
	return { name, description: `Description of ${name}`, category, subcommands: [], contextMenus: [], permissions: null, ...overrides };
}

const commands: CatalogCommand[] = [
	createCommand('automod', 'Management', {
		subcommands: [
			{ name: 'create', description: 'Create an auto-moderation rule' },
			{ name: 'delete', description: 'Delete an auto-moderation rule' }
		],
		permissions: 1n << 5n
	}),
	createCommand('ban', 'Moderation', { description: 'Ban a member', permissions: 1n << 2n }),
	createCommand('report', 'Moderation', { description: 'Report a member to the moderators', contextMenus: ['Report Message', 'Report User'] }),
	createCommand('whois', 'Tools', { subcommands: [{ name: 'user', description: 'Show a user' }] }),
	// Enough commands for several pages:
	...Array.from({ length: 20 }, (_, index) => createCommand(`extra-${String(index).padStart(2, '0')}`, 'Tools'))
];

function createContext(ids: Record<string, string> = {}): CommandsMenuContext {
	return { t, ownerId, commands, ids: new Map(Object.entries(ids)) };
}

interface AnyComponent {
	type: ComponentType;
	content?: string;
	custom_id?: string;
	disabled?: boolean;
	options?: { value: string; default?: boolean }[];
	components?: AnyComponent[];
	accessory?: AnyComponent;
	component?: AnyComponent;
}

function flatten(components: readonly unknown[]): AnyComponent[] {
	return (components as AnyComponent[]).flatMap((component) => [
		component,
		...flatten([
			...(component.components ?? []),
			...(component.accessory ? [component.accessory] : []),
			...(component.component ? [component.component] : [])
		])
	]);
}

function getText(components: readonly unknown[]) {
	return flatten(components)
		.filter((component) => component.type === ComponentType.TextDisplay)
		.map((component) => component.content)
		.join('\n');
}

function getCustomIds(components: readonly unknown[]) {
	return flatten(components)
		.map((component) => component.custom_id)
		.filter((id): id is string => id !== undefined);
}

describe('commands menu', () => {
	describe('custom IDs', () => {
		test('GIVEN an action THEN it survives the round trip the framework parser does', () => {
			const action = { ownerId, verb: 'results', target: 'auto mod', page: 2 } as const;
			const id = encodeCommandsMenuId(action);

			expect(id).toBe(`commands.${ownerId}.results:auto mod:2`);
			expect(decodeCommandsMenuId(id.split('.').slice(1))).toEqual(action);
		});

		test('GIVEN the longest query THEN the custom ID fits in 100 characters', () => {
			const id = encodeCommandsMenuId({ ownerId: '12345678901234567890', verb: 'results', target: 'x'.repeat(32), page: 99 });
			expect(id.length).toBeLessThanOrEqual(100);
		});

		test('GIVEN something else THEN it decodes to null', () => {
			expect(decodeCommandsMenuId(null)).toBeNull();
			expect(decodeCommandsMenuId([ownerId, 'explode::0'])).toBeNull();
			expect(decodeCommandsMenuId([ownerId, 'list::-1'])).toBeNull();
			expect(decodeCommandsMenuId([ownerId, 'list'])).toBeNull();
		});
	});

	describe('catalog', () => {
		test('GIVEN the data a command is registered with THEN its subcommands are listed by their path', () => {
			const command = toCatalogCommand(
				{
					name: 'settings',
					description: 'Open the settings',
					description_localizations: { it: 'Apri le impostazioni' },
					default_member_permissions: '32',
					options: [
						{ type: ApplicationCommandOptionType.Subcommand, name: 'server', description: 'The server' },
						{
							type: ApplicationCommandOptionType.SubcommandGroup,
							name: 'rule',
							description: 'Rules',
							options: [
								{
									type: ApplicationCommandOptionType.Subcommand,
									name: 'add',
									description: 'Add',
									description_localizations: { it: 'Aggiungi' }
								}
							]
						}
					]
				},
				'it',
				{ category: 'Management', contextMenus: [] }
			);

			expect(command).toEqual({
				name: 'settings',
				description: 'Apri le impostazioni',
				category: 'Management',
				subcommands: [
					{ name: 'server', description: 'The server' },
					{ name: 'rule add', description: 'Aggiungi' }
				],
				contextMenus: [],
				permissions: 32n
			});
		});

		test('GIVEN commands THEN their categories are counted', () => {
			expect(getCommandCategories(commands)).toEqual([
				{ name: 'Management', count: 1 },
				{ name: 'Moderation', count: 2 },
				{ name: 'Tools', count: 21 }
			]);
		});

		test('GIVEN what a user wrote THEN the query is what a custom ID can carry', () => {
			expect(normalizeCommandQuery('  Auto:Mod.  RULE ')).toBe('auto mod rule');
			expect(normalizeCommandQuery('/set-nickname')).toBe('set-nickname');
			expect(normalizeCommandQuery('x'.repeat(100))).toHaveLength(32);
			expect(normalizeCommandQuery('::..')).toBe('');
		});

		test('GIVEN commands THEN every one that can be run is an entry, and a parent of subcommands is not', () => {
			expect(
				listCatalogEntries(commands)
					.map((entry) => entry.path)
					.slice(0, 6)
			).toEqual(['automod create', 'automod delete', 'ban', 'extra-00', 'extra-01', 'extra-02']);
			expect(listCatalogEntries(commands).some((entry) => entry.path === 'automod')).toBe(false);
			expect(listCatalogEntries(commands).find((entry) => entry.path === 'automod delete')).toMatchObject({
				description: 'Delete an auto-moderation rule',
				subcommand: 'delete'
			});
			expect(listCatalogEntries(commands)).toHaveLength(25);
		});

		test('GIVEN a query THEN it searches the paths, descriptions and context menu commands of the entries', () => {
			const paths = (query: string) => searchCatalogEntries(listCatalogEntries(commands), query).map((entry) => entry.path);

			expect(paths('ban')).toEqual(['ban']);
			expect(paths('rule')).toEqual(['automod create', 'automod delete']);
			expect(paths('automod delete')).toEqual(['automod delete']);
			expect(paths('report message')).toEqual(['report']);
			expect(paths('member')).toEqual(['ban', 'report']);
			expect(paths('nothing-like-this')).toEqual([]);
			expect(paths('')).toEqual([]);
		});

		test('GIVEN a query a path has THEN that entry comes first', () => {
			const entries = listCatalogEntries([createCommand('alpha', 'Tools', { description: 'mentions whois' }), createCommand('whois', 'Tools')]);
			expect(searchCatalogEntries(entries, 'whois').map((entry) => entry.path)).toEqual(['whois', 'alpha']);
		});
	});

	describe('rendering', () => {
		test('GIVEN every page of every category THEN the message fits in the limits of Discord', () => {
			for (const category of ['', 'Management', 'Moderation', 'Tools']) {
				for (let page = 0; page < 5; page++) {
					const message = renderCommandsList(createContext(), category, page);
					const ids = getCustomIds(message.components!);

					expect(flatten(message.components!).length).toBeLessThanOrEqual(40);
					expect(new Set(ids).size).toBe(ids.length);
					expect(ids.every((id) => id.length <= 100)).toBe(true);
					expect(message.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
				}
			}
		});

		test('GIVEN a category THEN only its commands are listed and it is the selected one', () => {
			const message = renderCommandsList(createContext(), 'Moderation', 0);
			const select = flatten(message.components!).find((component) => component.type === ComponentType.StringSelect)!;

			expect(getText(message.components!)).toContain('`/ban`');
			expect(getText(message.components!)).not.toContain('`/whois user`');
			expect(select.options!.map((option) => option.value)).toEqual(['-', 'Management', 'Moderation', 'Tools']);
			expect(select.options!.filter((option) => option.default).map((option) => option.value)).toEqual(['Moderation']);
		});

		test('GIVEN a category the bot does not have THEN every command is listed', () => {
			const select = flatten(renderCommandsList(createContext(), 'Nope', 0).components!).find(
				(component) => component.type === ComponentType.StringSelect
			)!;
			expect(select.options!.filter((option) => option.default).map((option) => option.value)).toEqual(['-']);
		});

		test('GIVEN a page out of range THEN the last one is rendered', () => {
			const text = getText(renderCommandsList(createContext(), 'Tools', 99).components!);

			expect(text).toContain('`/whois user`');
			expect(text).not.toContain('`/extra-19`');
			expect(text).toContain('"page":5,"total":5,"count":21');
		});

		test('GIVEN the commands THEN each subcommand is listed by itself, numbered, with the button that edits its command', () => {
			const message = renderCommandsList(createContext(), '', 0);
			const text = getText(message.components!);
			const edits = getCustomIds(message.components!).filter((id) => id.includes('.edit:'));

			expect(text).toContain('**1. `/automod create`**');
			expect(text).toContain('Create an auto-moderation rule');
			expect(text).toContain('**2. `/automod delete`**');
			expect(text).toContain('**3. `/ban`**');
			expect(edits).toHaveLength(5);
			expect(edits[0]).toBe(`commands.${ownerId}.edit:automod create:0`);
			expect(edits[1]).toBe(`commands.${ownerId}.edit:automod delete:0`);
		});

		test('GIVEN a page THEN the footer counts the pages and the commands that can be run', () => {
			expect(getText(renderCommandsList(createContext(), 'Moderation', 0).components!)).toContain('"page":1,"total":1,"count":2');
		});

		test('GIVEN the middle of a list THEN it can go to the first, previous, next and last page and ask for one', () => {
			const message = renderCommandsList(createContext(), 'Tools', 1);
			const buttons = flatten(message.components!).filter(
				(component) => component.type === ComponentType.Button && component.custom_id?.startsWith(`commands.${ownerId}.`)
			);
			const actions = buttons.map((button) => decodeCommandsMenuId(button.custom_id!.split('.').slice(1))).filter((action) => action !== null);
			const navigation = actions.filter((action) => action.verb !== 'edit' && action.verb !== 'search');

			expect(navigation.map((action) => [action.verb, action.page])).toEqual([
				['list', 0],
				['list', 0],
				['jump', 1],
				['list', 2],
				['list', 4]
			]);
			expect(buttons.filter((button) => button.disabled)).toHaveLength(0);
			expect(navigation[2].target).toBe('list/Tools');
		});

		test('GIVEN the first page THEN it cannot go back, and a single page cannot be jumped in', () => {
			const disabled = (message: ReturnType<typeof renderCommandsList>) =>
				flatten(message.components!)
					.filter((component) => component.type === ComponentType.Button && component.disabled)
					.map((component) => decodeCommandsMenuId(component.custom_id!.split('.').slice(1))?.verb);

			expect(disabled(renderCommandsList(createContext(), 'Tools', 0))).toEqual(['list', 'list']);
			expect(disabled(renderCommandsList(createContext(), 'Moderation', 0))).toEqual(['list', 'list', 'jump', 'list', 'list']);
		});

		test('GIVEN the page modal THEN it asks for a number and keeps the list it is for', () => {
			const modal = renderCommandsPageModal(t, ownerId, 'results/ban');
			const [input] = flatten(modal.components).filter((component) => component.type === ComponentType.TextInput);

			expect(decodeCommandsMenuId(modal.custom_id.split('.').slice(1))).toEqual({ ownerId, verb: 'goto', target: 'results/ban', page: 0 });
			expect(input).toMatchObject({ custom_id: 'page', required: true });
		});

		test('GIVEN a command THEN its modal shows what it is and asks whether it is enabled', () => {
			const modal = renderCommandEditModal(createContext(), commands[0], null);
			const text = getText(modal.components);
			const radio = flatten(modal.components).find((component) => component.type === ComponentType.RadioGroup)!;

			expect(modal.title).toContain('commands/commands:editTitle');
			expect(decodeCommandsMenuId(modal.custom_id.split('.').slice(1))).toEqual({ ownerId, verb: 'save', target: 'automod', page: 0 });
			expect(text).toContain('`/automod`');
			expect(text).toContain('commands/commands:editStatusEnabled');
			expect(text).toContain('"count":2');
			expect(radio.custom_id).toBe('status');
			expect(radio.options!.map((option) => [option.value, option.default])).toEqual([
				['enabled', true],
				['disabled', false]
			]);
		});

		test('GIVEN a command a server disabled THEN its modal says by what and selects Disabled', () => {
			const modal = renderCommandEditModal(createContext(), commands[1], 'Moderation.*');
			const radio = flatten(modal.components).find((component) => component.type === ComponentType.RadioGroup)!;

			expect(getText(modal.components)).toContain('commands/commands:editStatusDisabled {"rule":"Moderation.*"}');
			expect(radio.options!.filter((option) => option.default).map((option) => option.value)).toEqual(['disabled']);
		});

		test('GIVEN the results of a search THEN they can be paged and left', () => {
			const message = renderCommandsResults(createContext(), 'extra', 1);
			const verbs = getCustomIds(message.components!).map((id) => decodeCommandsMenuId(id.split('.').slice(1))?.verb);

			expect(getText(message.components!)).toContain('commands/commands:menuResults');
			expect(verbs.filter((verb) => verb === 'results')).toHaveLength(4);
			expect(verbs).toContain('jump');
			expect(verbs).toContain('list');
			expect(flatten(message.components!).some((component) => component.type === ComponentType.StringSelect)).toBe(false);
		});

		test('GIVEN a search that finds nothing THEN it says so', () => {
			expect(getText(renderCommandsResults(createContext(), 'zzz', 0).components!)).toContain('commands/commands:menuNoResults');
		});

		test('GIVEN the IDs of the commands THEN a command that can be run is mentioned, and a parent is not', () => {
			const context = createContext({ ban: '111111111111111111', automod: '222222222222222222' });

			expect(getText(renderCommandsList(context, '', 0).components!)).toContain('</ban:111111111111111111>');
			expect(getText(renderCommandsList(context, '', 0).components!)).toContain('</automod create:222222222222222222>');
			expect(getText(renderCommand(context, commands[0]).components!)).not.toContain('`/automod`\n');
			expect(getText(renderCommand(context, commands[0]).components!)).toContain('</automod create:222222222222222222>');
		});

		test('GIVEN a command THEN its view has its subcommands, its context menu commands and its permissions', () => {
			const automod = getText(renderCommand(createContext(), commands[0]).components!);
			const report = getText(renderCommand(createContext(), commands[2]).components!);

			expect(automod).toContain('`/automod create`');
			expect(automod).toContain('Delete an auto-moderation rule');
			expect(automod).toContain('permissions:ManageGuild');
			expect(report).toContain('`Report Message`, `Report User`');
			expect(report).toContain('commands/commands:viewPermissionsNone');
		});

		test('GIVEN the search THEN its modal asks for one short text', () => {
			const modal = renderCommandsSearchModal(t, ownerId);
			const [input] = flatten(modal.components).filter((component) => component.type === ComponentType.TextInput);

			expect(decodeCommandsMenuId(modal.custom_id.split('.').slice(1))).toEqual({ ownerId, verb: 'query', target: '', page: 0 });
			expect(input).toMatchObject({ custom_id: 'query', required: true, max_length: 32 });
		});
	});
});
