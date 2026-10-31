import { convertLegacyAutomodRules } from '../../src/legacy/automod.js';
import { createLegacyGuild } from './fixtures.js';

const Guild = '254360814063058944';
const Channel = '254360814063058945';
const Role = '254360814063058946';

function convert(overrides: Record<string, unknown> = {}) {
	return convertLegacyAutomodRules(createLegacyGuild(overrides), Guild);
}

describe('convertLegacyAutomodRules', () => {
	test('GIVEN a configuration nobody touched THEN there is no rule', () => {
		expect(convert().rules).toEqual([]);
	});

	test('GIVEN a global ignored channel alone THEN there is no rule', () => {
		expect(convert({ 'selfmod.ignored-channels': [Channel] }).rules).toEqual([]);
	});

	test('GIVEN an enabled rule with no hard action THEN it keeps taking none', () => {
		const { rules } = convert({ 'selfmod.capitals.enabled': true, 'selfmod.capitals.soft-action': 1 });
		expect(rules).toEqual([
			{
				guild_id: Guild,
				name: 'Capitals',
				type: 'Capitals',
				enabled: true,
				soft_action: 1,
				hard_action: 'None',
				hard_action_duration: null,
				threshold_maximum: 10,
				threshold_duration: 60_000,
				ignored_roles: [],
				ignored_channels: [],
				options: { minimum: 15, maximum: 50 }
			}
		]);
	});

	test('GIVEN a rule that is off but was customised THEN it is a disabled rule', () => {
		expect(convert({ 'selfmod.links.allowed': ['example.com'] }).rules).toMatchObject([
			{ type: 'Links', enabled: false, options: { allowed: ['example.com'] } }
		]);
	});

	test.each([
		[0, 'None'],
		[1, 'Warning'],
		[2, 'Kick'],
		[3, 'Mute'],
		[4, 'Softban'],
		[5, 'Ban'],
		[6, 'Timeout']
	])('GIVEN the hard action %i THEN it is %s', (value, action) => {
		expect(convert({ 'selfmod.attachments.enabled': true, 'selfmod.attachments.hard-action': value }).rules[0]).toMatchObject({
			hard_action: action
		});
	});

	test('GIVEN a punishment past what the column holds THEN it is cut and told', () => {
		const { rules, warnings } = convert({ 'selfmod.attachments.hard-action-duration': 2 ** 40 });
		expect(rules[0]).toMatchObject({ hard_action_duration: 2 ** 31 - 1 });
		expect(warnings).toHaveLength(1);
	});

	test('GIVEN a limit the dashboard allowed THEN it stays as it was', () => {
		const { rules, warnings } = convert({ 'selfmod.newlines.enabled': true, 'selfmod.newlines.maximum': 500 });
		expect(rules[0]).toMatchObject({ options: { maximum: 500 } });
		expect(warnings).toEqual([]);
	});

	test('GIVEN the threshold of production THEN it stays as it was', () => {
		const { rules, warnings } = convert({ 'selfmod.links.enabled': true, 'selfmod.links.threshold-maximum': 900 });
		expect(rules[0]).toMatchObject({ threshold_maximum: 900 });
		expect(warnings).toEqual([]);
	});

	test('GIVEN a threshold V7 cannot hold THEN it changes and it is told', () => {
		const { rules, warnings } = convert({ 'selfmod.links.enabled': true, 'selfmod.links.threshold-maximum': 5000 });
		expect(rules[0]).toMatchObject({ threshold_maximum: 1000 });
		expect(warnings).toEqual([expect.stringContaining('threshold')]);
	});

	test('GIVEN an option out of the limits of V7 THEN it changes and it is told', () => {
		const { rules, warnings } = convert({ 'selfmod.messages.enabled': true, 'selfmod.messages.queue-size': 5 });
		expect(rules[0]).toMatchObject({ options: { maximum: 5, queueSize: 10 } });
		expect(warnings).toEqual([expect.stringContaining('queueSize')]);
	});

	test('GIVEN mention spam out of the limits of V7 THEN it changes and it is told', () => {
		const { warnings } = convert({ 'no-mention-spam.enabled': true, 'no-mention-spam.mentions-allowed': 0 });
		expect(warnings).toEqual([expect.stringContaining('maximum')]);
	});

	test('GIVEN a duration of zero THEN the punishment is permanent', () => {
		expect(convert({ 'selfmod.attachments.enabled': true, 'selfmod.attachments.hard-action-duration': 0 }).rules[0]).toMatchObject({
			hard_action_duration: null
		});
	});

	test('GIVEN the channels every rule ignores THEN each rule ignores them too', () => {
		const { rules } = convert({
			'selfmod.ignored-channels': [Channel],
			'selfmod.newlines.enabled': true,
			'selfmod.newlines.ignored-channels': [Role],
			'selfmod.newlines.ignored-roles': [Role]
		});
		expect(rules[0]).toMatchObject({ name: 'New lines', ignored_channels: [Role, Channel], ignored_roles: [Role] });
	});

	test('GIVEN the invites THEN their codes and guilds are the allowed ones', () => {
		expect(convert({ 'selfmod.invites.ignored-codes': ['wolfstar'], 'selfmod.invites.ignored-guilds': [Channel] }).rules[0]).toMatchObject({
			type: 'Invites',
			options: { allowedCodes: ['wolfstar'], allowedGuilds: [Channel] }
		});
	});

	test('GIVEN the word filter THEN it is a rule of words', () => {
		expect(convert({ 'selfmod.filter.enabled': true, 'selfmod.filter.raw': ['BadWord'] }).rules[0]).toMatchObject({
			type: 'Words',
			options: { words: ['badword'] }
		});
	});

	test('GIVEN the message filter THEN it is a rule of identical messages', () => {
		expect(
			convert({ 'selfmod.messages.enabled': true, 'selfmod.messages.maximum': 3, 'selfmod.messages.queue-size': 20 }).rules[0]
		).toMatchObject({
			type: 'MessageDuplicates',
			options: { maximum: 3, queueSize: 20 }
		});
	});

	test('GIVEN the mention spam filter THEN it is a weighted rule that bans at the first infraction and alerts', () => {
		expect(
			convert({ 'no-mention-spam.enabled': true, 'no-mention-spam.mentions-allowed': 12, 'no-mention-spam.time-period': 30 }).rules[0]
		).toEqual({
			guild_id: Guild,
			name: 'Mention spam',
			type: 'MentionsCooldown',
			enabled: true,
			soft_action: 4,
			hard_action: 'Ban',
			hard_action_duration: null,
			threshold_maximum: 0,
			threshold_duration: 60_000,
			ignored_roles: [],
			ignored_channels: [],
			options: { maximum: 12, timePeriod: 30, weighted: true }
		});
	});
});
