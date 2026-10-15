import { getTimeZoneChoices, getTimeZoneOffset, isTimeZone, resolveTimeZone, TimeZoneGroups } from '#utils/timezones';

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

describe('time zone groups', () => {
	test('GIVEN each group THEN it fits a select menu', () => {
		for (const zones of Object.values(TimeZoneGroups)) expect(zones.length).toBeLessThanOrEqual(25);
	});

	test('GIVEN every zone of the groups THEN the runtime has it, under its name or under an alias, and it is listed once', () => {
		const zones = Object.values(TimeZoneGroups).flat();
		expect(new Set(zones).size).toBe(zones.length);

		for (const group of Object.keys(TimeZoneGroups) as (keyof typeof TimeZoneGroups)[]) {
			const choices = getTimeZoneChoices(group);

			expect(choices.map((choice) => choice.label)).toEqual([...TimeZoneGroups[group]]);
			for (const choice of choices) expect(isTimeZone(choice.value)).toBe(true);
		}
	});

	test('GIVEN a time zone THEN its offset is told from UTC', () => {
		expect(getTimeZoneOffset('UTC')).toBe('UTC+00:00');
		expect(getTimeZoneOffset('Europe/Rome', new Date('2026-01-15T12:00:00Z'))).toBe('UTC+01:00');
		expect(getTimeZoneOffset('Europe/Rome', new Date('2026-07-15T12:00:00Z'))).toBe('UTC+02:00');
		expect(getTimeZoneOffset('Asia/Kolkata')).toBe('UTC+05:30');
	});
});
