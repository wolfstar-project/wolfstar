import { getBoostChange } from '#lib/moderation/logs/boosts';

describe('getBoostChange', () => {
	it.each([
		['a member who does not boost', null, null],
		['a member who keeps boosting', 1_700_000_000_000, 1_700_000_000_000]
	])('sees nothing for %s', (_, previous, next) => {
		expect(getBoostChange(previous, next)).toBeNull();
	});

	it('sees a boost that starts', () => {
		expect(getBoostChange(null, 1_700_000_000_000)).toEqual({ type: 'start', since: 1_700_000_000_000 });
	});

	it('sees a boost that stops, since when it started', () => {
		expect(getBoostChange(1_600_000_000_000, null)).toEqual({ type: 'stop', since: 1_600_000_000_000 });
	});

	it('takes a boost that started again for the one that started', () => {
		expect(getBoostChange(1_600_000_000_000, 1_700_000_000_000)).toEqual({ type: 'start', since: 1_700_000_000_000 });
	});
});
