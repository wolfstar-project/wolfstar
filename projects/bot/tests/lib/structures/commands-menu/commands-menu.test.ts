import {
	decodeCommandsMenuId,
	encodeCommandsMenuId,
	getCommandCategories,
	normalizeCommandQuery,
	renderCommand,
	renderCommandsList,
	renderCommandsResults,
	renderCommandsSearchModal,
	searchCommands,
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
}

function flatten(components: readonly unknown[]): AnyComponent[] {
	return (components as AnyComponent[]).flatMap((component) => [
		component,
		...flatten([...(component.components ?? []), ...(component.accessory ? [component.accessory] : [])])
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

		test('GIVEN a query THEN it searches names, descriptions, subcommands and context menu commands', () => {
			expect(searchCommands(commands, 'ban').map((command) => command.name)).toEqual(['ban']);
			expect(searchCommands(commands, 'rule').map((command) => command.name)).toEqual(['automod']);
			expect(searchCommands(commands, 'report message').map((command) => command.name)).toEqual(['report']);
			expect(searchCommands(commands, 'member').map((command) => command.name)).toEqual(['ban', 'report']);
			expect(searchCommands(commands, 'nothing-like-this')).toEqual([]);
			expect(searchCommands(commands, '')).toEqual([]);
		});

		test('GIVEN a query a name has THEN that command comes first', () => {
			const list = [createCommand('alpha', 'Tools', { description: 'mentions whois' }), createCommand('whois', 'Tools')];
			expect(searchCommands(list, 'whois').map((command) => command.name)).toEqual(['whois', 'alpha']);
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
			expect(getText(message.components!)).not.toContain('`/whois`');
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
			expect(getText(renderCommandsList(createContext(), 'Tools', 99).components!)).toContain('`/extra-19`');
		});

		test('GIVEN the results of a search THEN they can be paged and left', () => {
			const message = renderCommandsResults(createContext(), 'extra', 1);
			const verbs = getCustomIds(message.components!).map((id) => decodeCommandsMenuId(id.split('.').slice(1))?.verb);

			expect(getText(message.components!)).toContain('commands/commands:menuResults');
			expect(verbs.filter((verb) => verb === 'results')).toHaveLength(2);
			expect(verbs).toContain('list');
			expect(flatten(message.components!).some((component) => component.type === ComponentType.StringSelect)).toBe(false);
		});

		test('GIVEN a search that finds nothing THEN it says so', () => {
			expect(getText(renderCommandsResults(createContext(), 'zzz', 0).components!)).toContain('commands/commands:menuNoResults');
		});

		test('GIVEN the IDs of the commands THEN a command that can be run is mentioned, and a parent is not', () => {
			const context = createContext({ ban: '111111111111111111', automod: '222222222222222222' });

			expect(getText(renderCommandsList(context, '', 0).components!)).toContain('</ban:111111111111111111>');
			expect(getText(renderCommandsList(context, '', 0).components!)).toContain('`/automod`');
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
