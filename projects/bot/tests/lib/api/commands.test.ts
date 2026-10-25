import {
	flattenCommand,
	getCommandExplainedUsage,
	getCommandHelp,
	getCommandPermissionLevel,
	getCommandPreconditions,
	getCommandUsages,
	type ChatInputCommandData
} from '#lib/api/commands';
import { PermissionLevels } from '#lib/types';
import type { Command } from '@wolfstar/http-framework';
import { ApplicationCommandOptionType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

function createCommand(overrides: Partial<ChatInputCommandData> = {}): ChatInputCommandData {
	return { name: 'ban', description: 'Ban or unban a user.', ...overrides };
}

const user = { type: ApplicationCommandOptionType.User, name: 'user', description: 'The user to target.', required: true } as const;
const reason = { type: ApplicationCommandOptionType.String, name: 'reason', description: 'The reason, recorded in the moderation log.' } as const;

const ban = createCommand({
	options: [
		{ type: ApplicationCommandOptionType.Subcommand, name: 'add', description: 'Hit somebody with the ban hammer.', options: [user, reason] },
		{ type: ApplicationCommandOptionType.Subcommand, name: 'remove', description: 'Unban somebody from this server.', options: [user, reason] }
	]
});

describe('getCommandUsages', () => {
	test('GIVEN a command with options THEN it is one usage, with the required options in angle brackets', () => {
		const slowmode = createCommand({ name: 'slowmode', options: [{ ...user, name: 'duration' }, reason] });
		expect(getCommandUsages(slowmode, null)).toEqual(['<duration> [reason]']);
	});

	test('GIVEN a command with no options THEN its usage is empty', () => {
		expect(getCommandUsages(createCommand({ name: 'dehoist' }), null)).toEqual(['']);
	});

	test('GIVEN a command with subcommands THEN each subcommand is a usage', () => {
		expect(getCommandUsages(ban, null)).toEqual(['add <user> [reason]', 'remove <user> [reason]']);
	});

	test('GIVEN a subcommand group THEN its subcommands are written after the name of the group', () => {
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
						}
					]
				}
			]
		});
		expect(getCommandUsages(automod, null)).toEqual(['rule show [rule]']);
	});

	test('GIVEN a locale with localized names THEN the usages are written in it', () => {
		const localized = createCommand({
			options: [
				{
					type: ApplicationCommandOptionType.Subcommand,
					name: 'add',
					name_localizations: { it: 'aggiungi' },
					description: 'Hit somebody with the ban hammer.',
					options: [{ ...user, name_localizations: { it: 'utente' } }]
				}
			]
		});
		expect(getCommandUsages(localized, 'it')).toEqual(['aggiungi <utente>']);
		expect(getCommandUsages(localized, 'fr')).toEqual(['add <user>']);
	});
});

describe('getCommandExplainedUsage', () => {
	test('GIVEN a command with subcommands THEN they are explained first, then each option once', () => {
		expect(getCommandExplainedUsage(ban, null)).toEqual([
			['add', 'Hit somebody with the ban hammer.'],
			['remove', 'Unban somebody from this server.'],
			['user', 'The user to target.'],
			['reason', 'The reason, recorded in the moderation log.']
		]);
	});

	test('GIVEN an option that is described differently in two subcommands THEN each is written with its subcommand', () => {
		const archive = createCommand({
			name: 'archive',
			options: [
				{ type: ApplicationCommandOptionType.Subcommand, name: 'create', description: 'Save the messages.', options: [user] },
				{
					type: ApplicationCommandOptionType.Subcommand,
					name: 'list',
					description: 'List the histories.',
					options: [{ ...user, required: false, description: 'Only list the ones of this user.' }]
				}
			]
		});

		expect(getCommandExplainedUsage(archive, null)).toEqual([
			['create', 'Save the messages.'],
			['list', 'List the histories.'],
			['create <user>', 'The user to target.'],
			['list [user]', 'Only list the ones of this user.']
		]);
	});

	test('GIVEN an option named as a subcommand THEN it is written with its subcommand', () => {
		const whois = createCommand({
			name: 'whois',
			options: [
				{
					type: ApplicationCommandOptionType.Subcommand,
					name: 'user',
					description: 'Get information about a user.',
					options: [{ ...user, required: false, description: 'The user to get information about.' }]
				},
				{ type: ApplicationCommandOptionType.Subcommand, name: 'server', description: 'Get information about this server.' }
			]
		});

		expect(getCommandExplainedUsage(whois, null)).toEqual([
			['user', 'Get information about a user.'],
			['server', 'Get information about this server.'],
			['user [user]', 'The user to get information about.']
		]);
	});

	test('GIVEN a command with options THEN they are explained in their order', () => {
		const slowmode = createCommand({ name: 'slowmode', options: [{ ...user, name: 'duration', description: 'The new slowmode.' }, reason] });
		expect(getCommandExplainedUsage(slowmode, null)).toEqual([
			['duration', 'The new slowmode.'],
			['reason', 'The reason, recorded in the moderation log.']
		]);
	});

	test('GIVEN a locale with localized descriptions THEN the explanations are written in it', () => {
		const localized = createCommand({
			name: 'slowmode',
			options: [{ ...reason, description_localizations: { it: 'Il motivo, registrato nel log di moderazione.' } }]
		});
		expect(getCommandExplainedUsage(localized, 'it')).toEqual([['reason', 'Il motivo, registrato nel log di moderazione.']]);
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

describe('getCommandHelp', () => {
	function createTranslator(entries: Record<string, unknown>) {
		return vi.fn((key: string) => entries[key] ?? key.slice(key.indexOf(':') + 1));
	}

	test('GIVEN the texts of a command THEN they are given with the usages', () => {
		const t = createTranslator({
			'commands/help:/ban': {
				extendedHelp: 'Bans a member.',
				examples: ['add user:@Pete reason:Spam'],
				reminder: 'The owner cannot be banned.',
				possibleFormats: [['1d', 'A day']]
			}
		});

		expect(getCommandHelp(t as never, ban, null)).toEqual({
			usages: ['add <user> [reason]', 'remove <user> [reason]'],
			extendedHelp: 'Bans a member.',
			explainedUsage: [
				['add', 'Hit somebody with the ban hammer.'],
				['remove', 'Unban somebody from this server.'],
				['user', 'The user to target.'],
				['reason', 'The reason, recorded in the moderation log.']
			],
			possibleFormats: [['1d', 'A day']],
			examples: ['add user:@Pete reason:Spam'],
			reminder: 'The owner cannot be banned.'
		});
		expect(t).toHaveBeenCalledWith('commands/help:/ban', { returnObjects: true });
	});

	test('GIVEN a command with no texts THEN it only has the usages', () => {
		const dehoist = createCommand({ name: 'dehoist' });
		expect(getCommandHelp(createTranslator({}) as never, dehoist, null)).toEqual({ usages: [''] });
	});

	test('GIVEN texts of the wrong shape THEN they are left out', () => {
		const t = createTranslator({ 'commands/help:/dehoist': { extendedHelp: 5, examples: ['fine', 3], reminder: '', possibleFormats: [['a']] } });
		expect(getCommandHelp(t as never, createCommand({ name: 'dehoist' }), null)).toEqual({ usages: [''] });
	});

	test('GIVEN an empty example THEN it is kept, as the command run with no options', () => {
		const t = createTranslator({ 'commands/help:/commands': { examples: ['', 'command:ban'] } });
		expect(getCommandHelp(t as never, createCommand({ name: 'commands' }), null)).toEqual({ usages: [''], examples: ['', 'command:ban'] });
	});
});

describe('flattenCommand', () => {
	function createPiece(name: string, directories: string[], preconditions?: Command.Options['preconditions']) {
		return { name, location: { directories }, options: { preconditions } } as unknown as Command;
	}

	test('GIVEN a command THEN it is listed with the fields of the message commands, in the requested language', () => {
		const t = vi.fn(() => ({ extendedHelp: 'Restricts a member from a feature.' }));
		const restrict = createCommand({
			name: 'restrict',
			description: 'Restrict a user from using a feature in all channels.',
			description_localizations: { it: 'Impedisci a un utente di usare una funzione in tutti i canali.' },
			contexts: [InteractionContextType.Guild],
			default_member_permissions: PermissionFlagsBits.BanMembers.toString(),
			options: [
				{
					type: ApplicationCommandOptionType.Subcommand,
					name: 'voice',
					description: 'Restrict a user from joining any voice channel.',
					options: [user]
				}
			]
		});

		expect(flattenCommand(createPiece('restrict', ['Moderation', 'Restriction']), restrict, 'it', t as never)).toEqual({
			category: 'Moderation',
			subCategory: 'Restriction',
			alias: [],
			description: 'Impedisci a un utente di usare una funzione in tutti i canali.',
			extendedHelp: {
				usages: ['voice <user>'],
				extendedHelp: 'Restricts a member from a feature.',
				explainedUsage: [
					['voice', 'Restrict a user from joining any voice channel.'],
					['user', 'The user to target.']
				]
			},
			guarded: false,
			name: 'restrict',
			permissionLevel: PermissionLevels.Moderator,
			preconditions: { entries: [{ name: 'GuildOnly', context: {} }], mode: 0, runCondition: 0 }
		});
		expect(t).toHaveBeenCalledWith('commands/help:/restrict', { returnObjects: true });
	});

	test('GIVEN a command a server cannot disable THEN it is guarded', () => {
		const settings = createCommand({ name: 'settings', description: 'Open the settings menu of the server or your own.' });
		expect(
			flattenCommand(createPiece('settings', ['Management'], ['administrator']), settings, null, vi.fn(() => 'settings') as never)
		).toMatchObject({
			category: 'Management',
			subCategory: null,
			guarded: true,
			permissionLevel: PermissionLevels.Administrator,
			preconditions: { entries: [{ name: 'administrator', context: {} }], mode: 0, runCondition: 0 }
		});
	});
});
