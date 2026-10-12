import {
	findCommandRestriction,
	getCommandRestrictionDenial,
	readCommandRestrictions,
	removeFromCommandRestrictions,
	setCommandRestriction,
	type CommandRestriction
} from '#lib/structures/commands-menu';

const channelA = '111111111111111111';
const channelB = '222222222222222222';
const roleA = '333333333333333333';
const roleB = '444444444444444444';
const guildId = '254360814063058944';

function restriction(overrides: Partial<CommandRestriction> = {}): CommandRestriction {
	return { command: 'ban', allowedChannels: [], ignoredChannels: [], allowedRoles: [], ignoredRoles: [], ...overrides };
}

describe('command restrictions', () => {
	describe('readCommandRestrictions', () => {
		test('GIVEN what is not a list THEN there are no restrictions', () => {
			expect(readCommandRestrictions(null)).toEqual([]);
			expect(readCommandRestrictions({ command: 'ban' })).toEqual([]);
		});

		test('GIVEN a restriction THEN it is read, without what is not an ID and without what is twice', () => {
			const value = [{ command: 'ban', allowedChannels: [channelA, channelA, 'nope', 5], ignoredRoles: [roleA] }];

			expect(readCommandRestrictions(value)).toEqual([restriction({ allowedChannels: [channelA], ignoredRoles: [roleA] })]);
		});

		test('GIVEN a restriction that restricts nothing THEN it is dropped', () => {
			expect(readCommandRestrictions([{ command: 'ban', allowedChannels: [] }, 'nope', null])).toEqual([]);
		});

		test('GIVEN the commands a channel disabled, as the column held before THEN the channel is ignored by each', () => {
			const value = [
				{ channel: channelA, commands: ['ban', 'kick'] },
				{ channel: channelB, commands: ['ban'] }
			];

			expect(readCommandRestrictions(value)).toEqual([
				restriction({ ignoredChannels: [channelA, channelB] }),
				restriction({ command: 'kick', ignoredChannels: [channelA] })
			]);
		});

		test('GIVEN more entries than a list holds THEN it is cut', () => {
			const many = Array.from({ length: 30 }, (_, index) => `1000000000000000${String(index).padStart(2, '0')}`);

			expect(readCommandRestrictions([{ command: 'ban', ignoredRoles: many }])[0].ignoredRoles).toHaveLength(25);
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

	describe('getCommandRestrictionDenial', () => {
		const everyone = { channelIds: [channelA], roleIds: [guildId] };

		test('GIVEN no restriction THEN the command runs', () => {
			expect(getCommandRestrictionDenial(restriction(), everyone)).toBeNull();
		});

		test('GIVEN allowed channels THEN the command only runs in them', () => {
			const allowed = restriction({ allowedChannels: [channelA] });

			expect(getCommandRestrictionDenial(allowed, everyone)).toBeNull();
			expect(getCommandRestrictionDenial(allowed, { ...everyone, channelIds: [channelB] })).toBe('channel');
		});

		test('GIVEN an ignored channel THEN the command does not run in it, nor in its threads', () => {
			const ignored = restriction({ ignoredChannels: [channelA] });

			expect(getCommandRestrictionDenial(ignored, everyone)).toBe('channel');
			expect(getCommandRestrictionDenial(ignored, { ...everyone, channelIds: ['555555555555555555', channelA] })).toBe('channel');
			expect(getCommandRestrictionDenial(ignored, { ...everyone, channelIds: [channelB] })).toBeNull();
		});

		test('GIVEN allowed roles THEN only the members with one of them run the command', () => {
			const allowed = restriction({ allowedRoles: [roleA] });

			expect(getCommandRestrictionDenial(allowed, everyone)).toBe('role');
			expect(getCommandRestrictionDenial(allowed, { ...everyone, roleIds: [guildId, roleA, roleB] })).toBeNull();
		});

		test('GIVEN an ignored role THEN it wins over an allowed one', () => {
			const both = restriction({ allowedRoles: [roleA], ignoredRoles: [roleB] });

			expect(getCommandRestrictionDenial(both, { ...everyone, roleIds: [guildId, roleA, roleB] })).toBe('role');
		});

		test('GIVEN a channel and a role that both deny THEN the channel is what is told', () => {
			const both = restriction({ ignoredChannels: [channelA], ignoredRoles: [roleA] });

			expect(getCommandRestrictionDenial(both, { channelIds: [channelA], roleIds: [roleA] })).toBe('channel');
		});
	});
});
