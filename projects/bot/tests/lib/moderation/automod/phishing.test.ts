import { isListedHostname, normalizeHostname, parsePhishingList } from '#lib/moderation/automod/phishing';

describe('phishing', () => {
	describe('normalizeHostname', () => {
		test('GIVEN a hostname THEN it is lowercased, without `www.` and without the last dot', () => {
			expect(normalizeHostname('WWW.Example.COM.')).toBe('example.com');
			expect(normalizeHostname('example.com')).toBe('example.com');
		});
	});

	describe('parsePhishingList', () => {
		test('GIVEN a list THEN it keeps the strings, normalized', () => {
			expect([...parsePhishingList(['dIscord-app.com', '', 1, null, 'www.steam-gift.ru'])]).toEqual(['discord-app.com', 'steam-gift.ru']);
		});

		test('GIVEN something that is not a list THEN it throws', () => {
			expect(() => parsePhishingList({ domains: [] })).toThrow(TypeError);
		});
	});

	describe('isListedHostname', () => {
		const list = new Set(['discord-app.com', 'gifts.vercel.app']);

		test('GIVEN a listed hostname THEN it is found', () => {
			expect(isListedHostname(list, 'discord-app.com')).toBe(true);
			expect(isListedHostname(list, 'WWW.Discord-App.com')).toBe(true);
		});

		test('GIVEN a hostname under a listed one THEN it is found', () => {
			expect(isListedHostname(list, 'login.discord-app.com')).toBe(true);
		});

		test('GIVEN the parent of a listed hostname THEN it is not found', () => {
			expect(isListedHostname(list, 'vercel.app')).toBe(false);
			expect(isListedHostname(list, 'other.vercel.app')).toBe(false);
		});

		test('GIVEN a hostname that is not listed THEN it is not found', () => {
			expect(isListedHostname(list, 'discord.com')).toBe(false);
			expect(isListedHostname(new Set(['com']), 'discord.com')).toBe(false);
		});
	});
});
