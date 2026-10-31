import { convertLegacyCase } from '../../src/legacy/cases.js';

const Guild = '254360814063058944';
const User = '254360814063058945';
const Moderator = '254360814063058946';

const encode = (type: number, metadata: number) => ({ action: 'Ban', metadata: (1 << 16) | (type << 8) | metadata });

function row(overrides: Record<string, unknown> = {}) {
	return {
		case_id: 4,
		created_at: '2026-01-02T03:04:05.678912',
		duration: null,
		extra_data: null,
		guild_id: Guild,
		moderator_id: Moderator,
		reason: 'Spam',
		image_url: null,
		user_id: User,
		type: 0,
		metadata: 0,
		...overrides
	};
}

describe('convertLegacyCase', () => {
	test('GIVEN a case THEN it is the row the bot writes', () => {
		expect(convertLegacyCase(row(), encode)).toEqual({
			case: {
				id: 4,
				guild_id: Guild,
				action: 'Ban',
				metadata: 65_536,
				created_at: '2026-01-02 03:04:05.678',
				duration: 0,
				target_id: User,
				moderator_id: Moderator,
				reason: 'Spam'
			},
			data: null,
			warnings: []
		});
	});

	test('GIVEN a duration THEN it is in seconds', () => {
		expect(convertLegacyCase(row({ duration: 60_000 }), encode)?.case).toMatchObject({ duration: 60 });
	});

	test('GIVEN a duration past what the column holds THEN it is cut and told', () => {
		const converted = convertLegacyCase(row({ duration: 2 ** 53 }), encode)!;
		expect(converted.case).toMatchObject({ duration: 2 ** 31 - 1 });
		expect(converted.warnings).toHaveLength(1);
	});

	test('GIVEN an image THEN its link joins the reason', () => {
		expect(convertLegacyCase(row({ image_url: 'https://a.b/c.png' }), encode)?.case).toMatchObject({ reason: 'Spam\nhttps://a.b/c.png' });
		expect(convertLegacyCase(row({ reason: null, image_url: 'https://a.b/c.png' }), encode)?.case).toMatchObject({ reason: 'https://a.b/c.png' });
	});

	test('GIVEN extra data THEN it goes to the data of the case', () => {
		expect(convertLegacyCase(row({ extra_data: { roles: ['1'] } }), encode)?.data).toEqual({
			case_id: 4,
			guild_id: Guild,
			extra_data: { roles: ['1'] }
		});
	});

	test.each([
		['no user', { user_id: null }],
		['no date', { created_at: null }],
		['a type that is not one', { type: 16 }],
		['a moderator that is not a snowflake', { moderator_id: 'bot' }]
	])('GIVEN %s THEN it is left out', (_, overrides) => {
		expect(convertLegacyCase(row(overrides), encode)).toBeNull();
	});
});
