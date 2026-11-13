import { formatTimestamp, parseTimestamp } from 'wolfstar-database';

describe('timestamps', () => {
	const milliseconds = Date.UTC(2026, 9, 8, 13, 2, 18, 76);

	test('GIVEN the text the driver gives back, without a zone THEN it is read as UTC, whatever the zone of the process', () => {
		expect(parseTimestamp('2026-10-08 13:02:18.076')).toBe(milliseconds);
	});

	test('GIVEN a text that says its zone THEN it is read as it is', () => {
		expect(parseTimestamp('2026-10-08T13:02:18.076Z')).toBe(milliseconds);
		expect(parseTimestamp('2026-10-08 15:02:18.076+02')).toBe(milliseconds);
		expect(parseTimestamp('2026-10-08T15:02:18.076+02:00')).toBe(milliseconds);
	});

	test('GIVEN milliseconds THEN what is written reads back the same', () => {
		expect(formatTimestamp(milliseconds)).toBe('2026-10-08T13:02:18.076Z');
		expect(parseTimestamp(formatTimestamp(milliseconds))).toBe(milliseconds);
	});
});
