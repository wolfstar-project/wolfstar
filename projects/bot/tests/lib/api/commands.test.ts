import { getCommandEntries, getCommandPermissionLevel, getCommandPreconditions, type ChatInputCommandData } from '#lib/api/commands';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { PermissionLevels } from '#lib/types';
import { Collection } from '@discordjs/collection';
import type { Command } from '@wolfstar/http-framework';
import { clearSubcommandRegistries, subCommandsGroupRegistry, subCommandsRegistry } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationCommandOptionType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

function createCommand(overrides: Partial<ChatInputCommandData> = {}): ChatInputCommandData {
	return { name: 'ban', description: 'Ban or unban a user.', ...overrides };
}

function createPiece(name: string, directories: string[], preconditions?: Command.Options['preconditions']) {
	return { name, location: { directories }, options: { preconditions } } as unknown as Command;
}

/**
 * A translation function that answers `commands/help:/<name>` with the texts given for it, and anything else with the
 * key, as i18next does for a key it does not have.
 */
function createTranslator(entries: Record<string, unknown> = {}) {
	return vi.fn((key: string) => entries[key] ?? key.slice(key.indexOf(':') + 1)) as never;
}

const user = { type: ApplicationCommandOptionType.User, name: 'user', description: 'The user to target.', required: true } as const;
const reason = { type: ApplicationCommandOptionType.String, name: 'reason', description: 'The reason, recorded in the moderation log.' } as const;

const ban = createCommand({
	contexts: [InteractionContextType.Guild],
	default_member_permissions: PermissionFlagsBits.BanMembers.toString(),
	options: [
		{ type: ApplicationCommandOptionType.Subcommand, name: 'add', description: 'Hit somebody with the ban hammer.', options: [user, reason] },
		{ type: ApplicationCommandOptionType.Subcommand, name: 'remove', description: 'Unban somebody from this server.', options: [user] }
	]
});

describe('getCommandEntries', () => {
	afterEach(() => clearSubcommandRegistries());

	test('GIVEN a command with no subcommands THEN it is one entry, its options written after its name', () => {
		const t = createTranslator({
			'commands/help:/slowmode': { extendedHelp: 'Sets the slowmode.', examples: ['duration:5m'], reminder: 'Use reset.' }
		});
		const slowmode = createCommand({
			name: 'slowmode',
			description: 'Set the slowmode of the channel.',
			contexts: [InteractionContextType.Guild],
			options: [{ ...user, type: ApplicationCommandOptionType.String, name: 'duration', description: 'The new slowmode.' }, reason]
		});

		expect(getCommandEntries(createPiece('slowmode', ['Moderation', 'Utilities'], ['moderator']), slowmode, null, t)).toEqual([
			{
				category: 'Moderation',
				subCategory: 'Utilities',
				alias: [],
				command: 'slowmode',
				description: 'Set the slowmode of the channel.',
				extendedHelp: {
					usages: ['<duration> [reason]'],
					extendedHelp: 'Sets the slowmode.',
					explainedUsage: [
						['duration', 'The new slowmode.'],
						['reason', 'The reason, recorded in the moderation log.']
					],
					examples: ['duration:5m'],
					reminder: 'Use reset.'
				},
				guarded: false,
				name: 'slowmode',
				permissionLevel: PermissionLevels.Moderator,
				preconditions: {
					entries: [
						{ name: 'GuildOnly', context: {} },
						{ name: 'moderator', context: {} }
					],
					mode: 0,
					runCondition: 0
				}
			}
		]);
		expect(t).toHaveBeenCalledWith('commands/help:/slowmode', { returnObjects: true });
	});

	test('GIVEN a command with no options and no texts THEN its usage is empty', () => {
		const [entry] = getCommandEntries(createPiece('dehoist', ['Moderation']), createCommand({ name: 'dehoist' }), null, createTranslator());
		expect(entry.extendedHelp).toEqual({ usages: [''] });
	});

	test('GIVEN a command with subcommands THEN each one is an entry, with the examples that run it', () => {
		const t = createTranslator({
			'commands/help:/ban': { extendedHelp: 'Bans a member.', examples: ['add user:@Pete reason:Spam', 'remove user:@Pete', 'add'] }
		});
		const entries = getCommandEntries(createPiece('ban', ['Moderation']), ban, null, t);

		expect(entries.map(({ name, command, description }) => ({ name, command, description }))).toEqual([
			{ name: 'ban add', command: 'ban', description: 'Hit somebody with the ban hammer.' },
			{ name: 'ban remove', command: 'ban', description: 'Unban somebody from this server.' }
		]);
		expect(entries[0].extendedHelp).toEqual({
			usages: ['<user> [reason]'],
			extendedHelp: 'Bans a member.',
			explainedUsage: [
				['user', 'The user to target.'],
				['reason', 'The reason, recorded in the moderation log.']
			],
			examples: ['user:@Pete reason:Spam', '']
		});
		expect(entries[1].extendedHelp).toEqual({
			usages: ['<user>'],
			extendedHelp: 'Bans a member.',
			explainedUsage: [['user', 'The user to target.']],
			examples: ['user:@Pete']
		});
		expect(entries.map(({ permissionLevel }) => permissionLevel)).toEqual([PermissionLevels.Moderator, PermissionLevels.Moderator]);
	});

	test('GIVEN a subcommand group THEN its subcommands are entries named after the group', () => {
		const t = createTranslator({ 'commands/help:/automod': { examples: ['rule show rule:Invites', 'rule list'] } });
		const automod = createCommand({
			name: 'automod',
			options: [
				{
					type: ApplicationCommandOptionType.SubcommandGroup,
					name: 'rule',
					description: 'Manage the rules.',
					options: [
						{
							type: ApplicationCommandOptionType.Subcommand,
							name: 'show',
							description: 'Show a rule.',
							options: [{ ...reason, name: 'rule' }]
						},
						{ type: ApplicationCommandOptionType.Subcommand, name: 'list', description: 'List the rules.' }
					]
				}
			]
		});

		const entries = getCommandEntries(createPiece('automod', ['Management', 'AutoModeration']), automod, null, t);
		expect(entries.map(({ name, extendedHelp }) => ({ name, usages: extendedHelp.usages, examples: extendedHelp.examples }))).toEqual([
			{ name: 'automod rule show', usages: ['[rule]'], examples: ['rule:Invites'] },
			{ name: 'automod rule list', usages: [''], examples: [''] }
		]);
	});

	test('GIVEN a locale THEN the descriptions, the options and the examples are written in it, and the names are kept', () => {
		const t = createTranslator({ 'commands/help:/ban': { examples: ['aggiungi utente:@Pete', 'add user:@Jack'] } });
		const localized = createCommand({
			options: [
				{
					type: ApplicationCommandOptionType.Subcommand,
					name: 'add',
					name_localizations: { it: 'aggiungi' },
					description: 'Hit somebody with the ban hammer.',
					description_localizations: { it: 'Colpisci qualcuno con il martello del ban.' },
					options: [{ ...user, name_localizations: { it: 'utente' }, description_localizations: { it: "L'utente." } }]
				}
			]
		});

		const [entry] = getCommandEntries(createPiece('ban', ['Moderation']), localized, 'it', t);
		expect(entry.name).toBe('ban add');
		expect(entry.description).toBe('Colpisci qualcuno con il martello del ban.');
		expect(entry.extendedHelp).toEqual({
			usages: ['<utente>'],
			explainedUsage: [['utente', "L'utente."]],
			examples: ['utente:@Pete', 'user:@Jack']
		});
	});

	test('GIVEN the piece of a subcommand that requires a level THEN only its entry requires it', () => {
		class SettingsServer {
			public readonly options = {};
			public chatInputRun() {
				return null;
			}
		}
		const descriptor = Object.getOwnPropertyDescriptor(SettingsServer.prototype, 'chatInputRun')!;
		RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)(SettingsServer.prototype, 'chatInputRun', descriptor);
		subCommandsRegistry.set(
			'settings',
			new Collection([['server', { commandPiece: new SettingsServer(), methodName: 'server', slashCommand: null }]]) as never
		);

		const settings = createCommand({
			name: 'settings',
			contexts: [InteractionContextType.Guild],
			options: [
				{ type: ApplicationCommandOptionType.Subcommand, name: 'server', description: 'Open the settings menu of the server.' },
				{ type: ApplicationCommandOptionType.Subcommand, name: 'user', description: 'Open your own settings.' }
			]
		});

		const entries = getCommandEntries(createPiece('settings', ['Management']), settings, null, createTranslator());
		expect(entries.map(({ name, guarded, permissionLevel, preconditions }) => ({ name, guarded, permissionLevel, preconditions }))).toEqual([
			{
				name: 'settings server',
				guarded: true,
				permissionLevel: PermissionLevels.Administrator,
				preconditions: {
					entries: [
						{ name: 'GuildOnly', context: {} },
						{ name: 'administrator', context: {} }
					],
					mode: 0,
					runCondition: 0
				}
			},
			{
				name: 'settings user',
				guarded: true,
				permissionLevel: PermissionLevels.Everyone,
				preconditions: { entries: [{ name: 'GuildOnly', context: {} }], mode: 0, runCondition: 0 }
			}
		]);
	});

	test('GIVEN the piece of a grouped subcommand with preconditions THEN its entry adds them to the ones of the command', () => {
		const piece = { options: { preconditions: [{ name: 'cooldown', context: { delay: 5000 } }] } };
		subCommandsGroupRegistry.set(
			'automod',
			new Collection([['rule', new Collection([['edit', { commandPiece: piece, methodName: 'edit', slashCommand: null }]])]]) as never
		);

		const automod = createCommand({
			name: 'automod',
			options: [
				{
					type: ApplicationCommandOptionType.SubcommandGroup,
					name: 'rule',
					description: 'Manage the rules.',
					options: [{ type: ApplicationCommandOptionType.Subcommand, name: 'edit', description: 'Edit a rule.' }]
				}
			]
		});

		const [entry] = getCommandEntries(
			createPiece('automod', ['Management'], { entries: ['administrator'], mode: 1 }),
			automod,
			null,
			createTranslator()
		);
		expect(entry.preconditions).toEqual({
			entries: [
				{ name: 'administrator', context: {} },
				{ name: 'cooldown', context: { delay: 5000 } }
			],
			mode: 1,
			runCondition: 0
		});
		expect(entry.permissionLevel).toBe(PermissionLevels.Administrator);
	});

	test('GIVEN a piece named apart from its command THEN the settings take it by the piece', () => {
		const thresholds = createCommand({
			name: 'warn-thresholds',
			options: [{ type: ApplicationCommandOptionType.Subcommand, name: 'list', description: 'List the thresholds.' }]
		});

		const [entry] = getCommandEntries(createPiece('warnThresholds', ['Management']), thresholds, null, createTranslator());
		expect(entry).toMatchObject({ name: 'warn-thresholds list', command: 'warnThresholds' });
	});

	test('GIVEN texts of the wrong shape THEN they are left out', () => {
		const t = createTranslator({ 'commands/help:/dehoist': { extendedHelp: 5, examples: ['fine', 3], reminder: '', possibleFormats: [['a']] } });
		const [entry] = getCommandEntries(createPiece('dehoist', ['Moderation']), createCommand({ name: 'dehoist' }), null, t);
		expect(entry.extendedHelp).toEqual({ usages: [''] });
	});

	test('GIVEN an empty example THEN it is kept, as the command run with no options', () => {
		const t = createTranslator({ 'commands/help:/commands': { examples: ['', 'command:ban'], possibleFormats: [['ban', 'A command']] } });
		const [entry] = getCommandEntries(createPiece('commands', ['Tools']), createCommand({ name: 'commands' }), null, t);
		expect(entry.extendedHelp).toEqual({ usages: [''], possibleFormats: [['ban', 'A command']], examples: ['', 'command:ban'] });
		expect(entry.guarded).toBe(true);
	});
});

describe('getCommandPermissionLevel', () => {
	test('GIVEN the administrator precondition THEN it is the administrator level, whatever Discord asks', () => {
		expect(getCommandPermissionLevel(['administrator'], PermissionFlagsBits.ManageRoles.toString())).toBe(PermissionLevels.Administrator);
	});

	test('GIVEN the moderator precondition THEN it is the moderator level, whatever Discord asks', () => {
		expect(getCommandPermissionLevel([{ name: 'moderator' }], PermissionFlagsBits.ManageGuild.toString())).toBe(PermissionLevels.Moderator);
	});

	test('GIVEN no precondition and no permission THEN everybody can run it', () => {
		expect(getCommandPermissionLevel(undefined, null)).toBe(PermissionLevels.Everyone);
		expect(getCommandPermissionLevel([], undefined)).toBe(PermissionLevels.Everyone);
	});

	test('GIVEN no precondition THEN it is read from the permissions Discord asks', () => {
		expect(getCommandPermissionLevel(undefined, PermissionFlagsBits.ManageGuild.toString())).toBe(PermissionLevels.Administrator);
		expect(getCommandPermissionLevel(undefined, PermissionFlagsBits.Administrator.toString())).toBe(PermissionLevels.Administrator);
		expect(getCommandPermissionLevel(undefined, PermissionFlagsBits.BanMembers.toString())).toBe(PermissionLevels.Moderator);
	});

	test('GIVEN a level that is only one of several alternatives THEN it is not the level of the command', () => {
		expect(getCommandPermissionLevel([['administrator', 'moderator']], null)).toBe(PermissionLevels.Everyone);
	});
});

describe('getCommandPreconditions', () => {
	test('GIVEN a command of the servers THEN it runs `GuildOnly` before its own preconditions', () => {
		expect(getCommandPreconditions(['moderator'], [InteractionContextType.Guild])).toEqual({
			entries: [
				{ name: 'GuildOnly', context: {} },
				{ name: 'moderator', context: {} }
			],
			mode: 0,
			runCondition: 0
		});
	});

	test('GIVEN a command that runs in direct messages too THEN it has no `GuildOnly`', () => {
		expect(getCommandPreconditions(undefined, [InteractionContextType.Guild, InteractionContextType.BotDM])).toEqual({
			entries: [],
			mode: 0,
			runCondition: 0
		});
		expect(getCommandPreconditions(undefined, undefined)).toEqual({ entries: [], mode: 0, runCondition: 0 });
	});

	test('GIVEN nested arrays THEN they alternate between `Or` and `And` as the framework runs them', () => {
		expect(getCommandPreconditions([{ name: 'cooldown', context: { delay: 5000 } }, ['moderator', ['dj', 'author']]], undefined)).toEqual({
			entries: [
				{ name: 'cooldown', context: { delay: 5000 } },
				{
					entries: [
						{ name: 'moderator', context: {} },
						{
							entries: [
								{ name: 'dj', context: {} },
								{ name: 'author', context: {} }
							],
							mode: 0,
							runCondition: 0
						}
					],
					mode: 0,
					runCondition: 1
				}
			],
			mode: 0,
			runCondition: 0
		});
	});

	test('GIVEN an array with a mode and a function THEN the mode is kept and the function is named', () => {
		function OwnerOnly() {
			return null as never;
		}

		expect(getCommandPreconditions({ entries: [OwnerOnly, ['moderator']], mode: 1 }, undefined)).toEqual({
			entries: [
				{ name: 'OwnerOnly', context: {} },
				{ entries: [{ name: 'moderator', context: {} }], mode: 1, runCondition: 1 }
			],
			mode: 1,
			runCondition: 0
		});
	});
});
