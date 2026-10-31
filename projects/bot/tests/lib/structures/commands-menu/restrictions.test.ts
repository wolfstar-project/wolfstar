import {
	findCommandRestriction,
	findMatchingRestrictions,
	getCommandRuleSpecificity,
	getCommandRestrictionRevision,
	getCommandRulesDenial,
	keepHiddenRestrictionEntries,
	listCommandMembers,
	readCommandRestrictions,
	removeFromCommandRestrictions,
	setCommandMembers,
	setCommandRestriction,
	writeCommandRestrictions,
	type CommandRestriction
} from '#lib/structures/commands-menu';
import { createCommand } from '../../../mocks/MockInstances.js';

const channelA = '111111111111111111';
const channelB = '222222222222222222';
const roleA = '333333333333333333';
const roleB = '444444444444444444';
const guildId = '254360814063058944';

function restriction(overrides: Partial<CommandRestriction> = {}): CommandRestriction {
	return {
		command: 'ban',
		allowedChannels: [],
		ignoredChannels: [],
		allowedRoles: [],
		ignoredRoles: [],
		allowedUsers: [],
		ignoredUsers: [],
		...overrides
	};
}

describe('command restrictions', () => {
	describe('readCommandRestrictions', () => {
		test('GIVEN what is not a list THEN there are no restrictions', () => {
			expect(readCommandRestrictions(null, guildId)).toEqual([]);
			expect(readCommandRestrictions({ command: 'ban' }, guildId)).toEqual([]);
		});

		test('GIVEN a restriction THEN it is read, without what is not an ID and without what is twice', () => {
			const value = [{ command: 'ban', allowedChannels: [channelA, channelA, 'nope', 5], ignoredRoles: [roleA] }];

			expect(readCommandRestrictions(value, guildId)).toEqual([restriction({ allowedChannels: [channelA], ignoredRoles: [roleA] })]);
		});

		test('GIVEN a restriction that restricts nothing THEN it is dropped', () => {
			expect(readCommandRestrictions([{ command: 'ban', allowedChannels: [] }, 'nope', null], guildId)).toEqual([]);
		});

		test('GIVEN the commands a channel disabled, as the column held before THEN the channel is ignored by each', () => {
			const value = [
				{ channel: channelA, commands: ['ban', 'kick'] },
				{ channel: channelB, commands: ['ban'] }
			];

			expect(readCommandRestrictions(value, guildId)).toEqual([
				restriction({ ignoredChannels: [channelA, channelB] }),
				restriction({ command: 'kick', ignoredChannels: [channelA] })
			]);
		});

		test('GIVEN more entries than a select menu shows THEN every one is kept', () => {
			const many = Array.from({ length: 30 }, (_, index) => `1000000000000000${String(index).padStart(2, '0')}`);

			expect(readCommandRestrictions([{ command: 'ban', ignoredRoles: many }], guildId)[0].ignoredRoles).toEqual(many);
		});
	});

	describe('the targets of a rule', () => {
		test('GIVEN targets THEN their specificity is command 3, sub-category 2, category 1, every command 0', () => {
			expect(['warn', 'Moderation.warn', 'Moderation.Management.warn'].map(getCommandRuleSpecificity)).toEqual([3, 3, 3]);
			expect(getCommandRuleSpecificity('Moderation.Management.*')).toBe(2);
			expect(getCommandRuleSpecificity('Moderation.*')).toBe(1);
			expect(getCommandRuleSpecificity('*')).toBe(0);
		});

		test('GIVEN rules on a command, its category and every command THEN the matching ones come most specific first', () => {
			const warn = createCommand('warn', 'Moderation');
			const rules = ['*', 'warn', 'Moderation.*', 'Tools.*'].map((command) => restriction({ command, ignoredRoles: [roleA] }));

			expect(findMatchingRestrictions(rules, warn).map((rule) => rule.command)).toEqual(['warn', 'Moderation.*', '*']);
		});
	});

	describe('the stored format', () => {
		const saved = [
			{ command: 'warn', allowedRoles: [roleA] },
			{ command: 'ban', ignoredRoles: [roleB] }
		];

		test('GIVEN rules saved before the format THEN the ones that allowed someone ignore @everyone', () => {
			expect(readCommandRestrictions(saved, guildId)).toEqual([
				restriction({ command: 'warn', allowedRoles: [roleA], ignoredRoles: [guildId] }),
				restriction({ command: 'ban', ignoredRoles: [roleB] })
			]);
		});

		test('GIVEN rules saved with the format THEN they are read as they are', () => {
			expect(readCommandRestrictions([...saved, { format: 2 }], guildId)).toEqual([
				restriction({ command: 'warn', allowedRoles: [roleA] }),
				restriction({ command: 'ban', ignoredRoles: [roleB] })
			]);
		});

		test('GIVEN rules to store THEN the format marker is written with them', () => {
			const rules = [restriction({ command: 'warn', allowedRoles: [roleA] })];
			const written = writeCommandRestrictions(rules);

			expect(written.at(-1)).toEqual({ format: 2 });
			expect(readCommandRestrictions(written, guildId)).toEqual(rules);
		});
	});

	describe('keepHiddenRestrictionEntries', () => {
		const many = Array.from({ length: 30 }, (_, index) => `1000000000000000${String(index).padStart(2, '0')}`);

		test('GIVEN a stored list longer than the modal shows THEN the entries it did not show are kept', () => {
			const picked = restriction({ ignoredChannels: [channelA, ...many.slice(1, 25)] });
			const kept = keepHiddenRestrictionEntries(picked, restriction({ ignoredChannels: many }));

			expect(kept.ignoredChannels).toEqual([channelA, ...many.slice(1)]);
		});

		test('GIVEN a stored list the modal showed whole THEN what was picked is saved', () => {
			const kept = keepHiddenRestrictionEntries(restriction({ allowedRoles: [roleB] }), restriction({ allowedRoles: [roleA] }));

			expect(kept).toEqual(restriction({ allowedRoles: [roleB] }));
		});
	});

	describe('the members of a rule', () => {
		const many = Array.from({ length: 30 }, (_, index) => `1000000000000000${String(index).padStart(2, '0')}`);

		test('GIVEN roles and users THEN a rule lists the roles first', () => {
			const listed = listCommandMembers(restriction({ allowedRoles: [roleA], allowedUsers: [roleB] }), 'allowed');

			expect(listed).toEqual([
				{ id: roleA, type: 'role' },
				{ id: roleB, type: 'user' }
			]);
		});

		test('GIVEN a pick THEN only the lists of that rule change', () => {
			const next = setCommandMembers(restriction({ ignoredRoles: [roleA] }), 'allowed', { roles: [roleB], users: [] });

			expect(next).toEqual(restriction({ ignoredRoles: [roleA], allowedRoles: [roleB] }));
		});

		test('GIVEN more members than the select menu shows THEN the ones it did not show are kept', () => {
			const stored = restriction({ allowedRoles: many.slice(0, 20), allowedUsers: many.slice(20) });
			const next = setCommandMembers(stored, 'allowed', { roles: [many[0]], users: [] });

			// The menu showed the 20 roles and 5 users; the other 5 users stay:
			expect(next.allowedRoles).toEqual([many[0]]);
			expect(next.allowedUsers).toEqual(many.slice(25));
		});
	});

	describe('getCommandRestrictionRevision', () => {
		test('GIVEN the same restriction and status THEN the revision is the same', () => {
			const revision = getCommandRestrictionRevision(restriction({ ignoredRoles: [roleA] }), false);

			expect(getCommandRestrictionRevision(restriction({ ignoredRoles: [roleA] }), false)).toBe(revision);
			expect(Number.isSafeInteger(revision) && revision >= 0).toBe(true);
		});

		test('GIVEN a list or the status that changed THEN the revision changes', () => {
			const revision = getCommandRestrictionRevision(restriction({ ignoredRoles: [roleA] }), false);

			expect(getCommandRestrictionRevision(restriction({ ignoredRoles: [roleA] }), true)).not.toBe(revision);
			expect(getCommandRestrictionRevision(restriction({ ignoredRoles: [roleA, roleB] }), false)).not.toBe(revision);
			expect(getCommandRestrictionRevision(restriction({ allowedRoles: [roleA] }), false)).not.toBe(revision);
		});
	});

	describe('setCommandRestriction', () => {
		test('GIVEN a restriction THEN it takes the place of the one of its command', () => {
			const before = [restriction({ ignoredRoles: [roleA] }), restriction({ command: 'kick', ignoredRoles: [roleA] })];
			const after = setCommandRestriction(before, restriction({ allowedRoles: [roleB] }));

			expect(after).toEqual([restriction({ command: 'kick', ignoredRoles: [roleA] }), restriction({ allowedRoles: [roleB] })]);
		});

		test('GIVEN a restriction that restricts nothing THEN the command is not restricted anymore', () => {
			expect(setCommandRestriction([restriction({ ignoredRoles: [roleA] })], restriction())).toEqual([]);
		});

		test('GIVEN a command that is not restricted THEN finding it gives an empty restriction', () => {
			expect(findCommandRestriction([], 'ban')).toEqual(restriction());
		});
	});

	describe('removeFromCommandRestrictions', () => {
		test('GIVEN a role no restriction has THEN nothing changes', () => {
			expect(removeFromCommandRestrictions([restriction({ ignoredRoles: [roleA] })], roleB)).toBeNull();
		});

		test('GIVEN a channel that is gone THEN it is taken out, and a restriction left empty is dropped', () => {
			const before = [restriction({ allowedChannels: [channelA] }), restriction({ command: 'kick', allowedChannels: [channelA, channelB] })];

			expect(removeFromCommandRestrictions(before, channelA)).toEqual([restriction({ command: 'kick', allowedChannels: [channelB] })]);
		});
	});

	test('GIVEN one form saved THEN lists belonging to the other form are retained', () => {
		const stored = restriction({ allowedUsers: ['666666666666666666'], ignoredChannels: [channelA], ignoredRoles: [roleA] });
		expect(keepHiddenRestrictionEntries(restriction({ allowedChannels: [channelB] }), stored, ['allowedChannels', 'ignoredChannels'])).toEqual({
			...stored,
			allowedChannels: [channelB],
			ignoredChannels: []
		});
	});

	describe('getCommandRulesDenial', () => {
		// The roles of a member come highest first, and `@everyone`, the guild, last:
		const high = roleA;
		const low = roleB;
		const userId = '666666666666666666';
		const subject = (roleIds: string[], channelId = channelA, user = userId) => ({ userId: user, channelIds: [channelId], roleIds });
		const rule = (command: string, overrides: Partial<CommandRestriction>) => restriction({ command, ...overrides });

		test('GIVEN an allowed high role and an ignored low one THEN the highest role decides', () => {
			const rules = [rule('warn', { allowedRoles: [high], ignoredRoles: [low] })];

			expect(getCommandRulesDenial(rules, subject([high, low, guildId]))).toBeNull();
			expect(getCommandRulesDenial(rules, subject([low, guildId]))).toBe('role');
		});

		test('GIVEN @everyone ignored and a role allowed THEN only that role runs it', () => {
			const rules = [rule('warn', { ignoredRoles: [guildId], allowedRoles: [high] })];

			expect(getCommandRulesDenial(rules, subject([guildId]))).toBe('role');
			expect(getCommandRulesDenial(rules, subject([high, guildId]))).toBeNull();
		});

		test('GIVEN a role ignored on a category and allowed on a command of it THEN the most specific rule decides', () => {
			const rules = [rule('warn', { allowedRoles: [low] }), rule('Moderation.*', { ignoredRoles: [low] })];

			expect(getCommandRulesDenial(rules, subject([low, guildId]))).toBeNull();
		});

		test('GIVEN a rule that names the member THEN it decides before the rules of their roles', () => {
			const allowedEverywhere = [rule('warn', { ignoredRoles: [high] }), rule('*', { allowedUsers: [userId] })];
			expect(getCommandRulesDenial(allowedEverywhere, subject([high, guildId]))).toBeNull();

			const ignored = [rule('warn', { ignoredUsers: [userId], allowedRoles: [high] })];
			expect(getCommandRulesDenial(ignored, subject([high, guildId]))).toBe('user');
		});

		test('GIVEN an ignored channel on every command and allowed channels on the command THEN both apply', () => {
			const rules = [rule('warn', { allowedChannels: [channelB] }), rule('*', { ignoredChannels: [channelA] })];

			expect(getCommandRulesDenial(rules, subject([guildId], channelA))).toBe('channel');
			expect(getCommandRulesDenial(rules, subject([guildId], '555555555555555555'))).toBe('channel');
			expect(getCommandRulesDenial(rules, subject([guildId], channelB))).toBeNull();
		});

		test('GIVEN the allowed channels of a command and of its category THEN the most specific ones apply', () => {
			const rules = [rule('warn', { allowedChannels: [channelB] }), rule('Moderation.*', { allowedChannels: [channelA] })];

			expect(getCommandRulesDenial(rules, subject([guildId], channelB))).toBeNull();
			expect(getCommandRulesDenial(rules, subject([guildId], channelA))).toBe('channel');
		});

		test('GIVEN a rule that only ignores a channel THEN the command runs anywhere else, whoever runs it', () => {
			const rules = [rule('warn', { ignoredChannels: [channelA] })];

			expect(getCommandRulesDenial(rules, subject([low, guildId], channelB))).toBeNull();
		});

		test('GIVEN no rule that names the member, their roles or a channel THEN the command runs', () => {
			expect(getCommandRulesDenial([rule('warn', { allowedRoles: [high] })], subject([low, guildId]))).toBeNull();
			expect(getCommandRulesDenial([], subject([guildId]))).toBeNull();
		});

		test('GIVEN a thread THEN it is restricted as the channel it is in', () => {
			const rules = [rule('warn', { ignoredChannels: [channelA] })];

			expect(getCommandRulesDenial(rules, { userId, channelIds: ['555555555555555555', channelA], roleIds: [guildId] })).toBe('channel');
		});
	});
});
