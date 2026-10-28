import {
	isGeneratedName,
	isJoinGuardAllowed,
	matchesJoinGuardRule,
	readJoinGuardSignals,
	type JoinGuardSignals
} from '#lib/moderation/joinguard/conditions';
import { DiscordSnowflake } from '@sapphire/snowflake';
import { UserFlags } from 'discord-api-types/v10';
import { createRule } from './fixtures';

const now = Date.UTC(2026, 9, 27, 12);
const hour = 3_600_000;

function signals(overrides: Partial<JoinGuardSignals> = {}): JoinGuardSignals {
	return { accountCreatedAt: now - 2 * hour, defaultAvatar: true, generatedName: false, names: ['raider'], unverifiedBot: false, ...overrides };
}

describe('isGeneratedName', () => {
	test.each(['name1234', 'user_5821', 'anna0001', 'user84721938', 'x12345', 'a8f3k2l9', 'xkcdqzrtw', '3fa9c0d1e27b'])(
		'GIVEN %s THEN it looks generated',
		(name) => expect(isGeneratedName(name)).toBe(true)
	);

	test.each([
		'john1998',
		'maria2007',
		'kyra',
		'knightsbridge',
		'strengths',
		'j0hn2k21',
		'dark_wolf',
		'xX_Gamer_Xx',
		'r2d2',
		'café',
		'',
		'abc1234def'
	])('GIVEN %s THEN it does not, a person picks such names', (name) => expect(isGeneratedName(name)).toBe(false));
});

describe('readJoinGuardSignals', () => {
	const id = DiscordSnowflake.generate({ timestamp: now - hour }).toString();

	test('GIVEN a user THEN the age comes from the ID, and the names are normalized', () => {
		const result = readJoinGuardSignals({ id, username: 'raider', globalName: 'ＦＲＥＥ Nitro', avatar: null, bot: false, flags: 0 });

		expect(result.accountCreatedAt).toBe(now - hour);
		expect(result.defaultAvatar).toBe(true);
		expect(result.unverifiedBot).toBe(false);
		expect(result.names[1]).toContain('free');
	});

	test('GIVEN an app THEN it is unverified unless it has the flag', () => {
		const user = { id, username: 'helper', globalName: null, avatar: 'a1b2', bot: true, flags: 0 };

		expect(readJoinGuardSignals(user).unverifiedBot).toBe(true);
		expect(readJoinGuardSignals({ ...user, flags: UserFlags.VerifiedBot }).unverifiedBot).toBe(false);
		expect(readJoinGuardSignals({ ...user, bot: false }).unverifiedBot).toBe(false);
	});

	test('GIVEN a generated username or global name THEN it is seen', () => {
		expect(readJoinGuardSignals({ id, username: 'user84721938', globalName: null, avatar: null, bot: false, flags: 0 }).generatedName).toBe(true);
		expect(readJoinGuardSignals({ id, username: 'kyra', globalName: 'name1234', avatar: null, bot: false, flags: 0 }).generatedName).toBe(true);
		expect(readJoinGuardSignals({ id, username: 'kyra', globalName: 'Kyra', avatar: null, bot: false, flags: 0 }).generatedName).toBe(false);
	});
});

describe('matchesJoinGuardRule', () => {
	test('GIVEN an account newer than the age of the rule THEN it matches, an older one does not', () => {
		const rule = createRule({ accountAgeMax: 86_400 });

		expect(matchesJoinGuardRule(rule, signals({ accountCreatedAt: now - hour }), now)).toBe(true);
		expect(matchesJoinGuardRule(rule, signals({ accountCreatedAt: now - 25 * hour }), now)).toBe(false);
	});

	test('GIVEN several conditions THEN every one must match', () => {
		const rule = createRule({ accountAgeMax: 86_400, defaultAvatar: true, generatedName: true });

		expect(matchesJoinGuardRule(rule, signals({ generatedName: true }), now)).toBe(true);
		expect(matchesJoinGuardRule(rule, signals({ generatedName: false }), now)).toBe(false);
		expect(matchesJoinGuardRule(rule, signals({ generatedName: true, defaultAvatar: false }), now)).toBe(false);
	});

	test('GIVEN a text to look for THEN it is found whatever its case and look-alike letters, in either name', () => {
		const rule = createRule({ nameContains: 'Nitro' });

		expect(matchesJoinGuardRule(rule, signals({ names: ['kyra', 'free nitro'] }), now)).toBe(true);
		expect(matchesJoinGuardRule(rule, readJoinGuardSignalsFor('ｎｉｔｒｏ_gift'), now)).toBe(true);
		expect(matchesJoinGuardRule(rule, signals({ names: ['kyra'] }), now)).toBe(false);
	});

	test('GIVEN an unverified app rule THEN only such an app matches', () => {
		const rule = createRule({ unverifiedBot: true });

		expect(matchesJoinGuardRule(rule, signals({ unverifiedBot: true }), now)).toBe(true);
		expect(matchesJoinGuardRule(rule, signals(), now)).toBe(false);
	});

	test('GIVEN a disabled rule, or one with no condition THEN it never matches', () => {
		expect(matchesJoinGuardRule(createRule({ defaultAvatar: true, enabled: false }), signals(), now)).toBe(false);
		expect(matchesJoinGuardRule(createRule({ sendToCheckpoint: true }), signals(), now)).toBe(false);
		expect(matchesJoinGuardRule(createRule({ nameContains: '   ' }), signals(), now)).toBe(false);
	});
});

describe('isJoinGuardAllowed', () => {
	const settings = { joinGuardAllowedUsers: ['10'], joinGuardAllowedRoles: ['20'] };

	test('GIVEN an allowed user, or a member with an allowed role THEN the guard leaves them alone', () => {
		expect(isJoinGuardAllowed(settings, '10', [])).toBe(true);
		expect(isJoinGuardAllowed(settings, '11', ['30', '20'])).toBe(true);
		expect(isJoinGuardAllowed(settings, '11', ['30'])).toBe(false);
	});
});

function readJoinGuardSignalsFor(username: string) {
	return readJoinGuardSignals({ id: '254360814063058944', username, globalName: null, avatar: null, bot: false, flags: 0 });
}
