import { isTimeZone, resolveTimeZone } from '#utils/timezones';

describe('timezones', () => {
	describe('resolveTimeZone', () => {
		test('GIVEN the name of a time zone THEN it is returned as the database writes it', () => {
			expect(resolveTimeZone('Europe/Rome')).toBe('Europe/Rome');
			expect(resolveTimeZone('  america/new_york ')).toBe('America/New_York');
		});

		test('GIVEN UTC THEN it is a time zone, though the runtime does not list it', () => {
			expect(resolveTimeZone('utc')).toBe('UTC');
		});

		test('GIVEN what is not a time zone THEN nothing is found', () => {
			expect(resolveTimeZone('Rome')).toBeNull();
			expect(resolveTimeZone('GMT+2')).toBeNull();
			expect(resolveTimeZone('')).toBeNull();
		});
	});

	describe('isTimeZone', () => {
		test('GIVEN a name as the database writes it THEN it is one', () => {
			expect(isTimeZone('Asia/Tokyo')).toBe(true);
			expect(isTimeZone('UTC')).toBe(true);
		});

		test('GIVEN a name in another case, or what is not text THEN it is not one', () => {
			expect(isTimeZone('asia/tokyo')).toBe(false);
			expect(isTimeZone(2)).toBe(false);
			expect(isTimeZone(null)).toBe(false);
		});
	});
});
