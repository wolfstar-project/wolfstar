import { countActiveWarnings, findReachedWarnThreshold, type WarningCase } from '#lib/moderation/warnThresholds';
import { TypeVariation } from '#utils/moderationConstants';

describe('warn thresholds', () => {
	const now = Date.UTC(2026, 9, 16, 12);
	const day = 86_400_000;
	const warning = (daysAgo: number, state: 'open' | 'removed' | 'undo' | 'archived' = 'open', type = TypeVariation.Warning): WarningCase => ({
		type,
		createdAt: now - daysAgo * day,
		isUndo: () => state === 'undo',
		isArchived: () => state === 'archived',
		isCompleted: () => state === 'removed'
	});

	describe('countActiveWarnings', () => {
		test('GIVEN warnings that were removed, archived or are removals THEN they do not count', () => {
			const entries = [warning(1), warning(2, 'removed'), warning(3, 'undo'), warning(4, 'archived'), warning(1, 'open', TypeVariation.Mute)];

			expect(countActiveWarnings(entries, 0, now)).toBe(1);
		});

		test('GIVEN a period THEN only the warnings within it count', () => {
			expect(countActiveWarnings([warning(1), warning(10), warning(40)], 30 * day, now)).toBe(2);
		});
	});

	describe('findReachedWarnThreshold', () => {
		const thresholds = [
			{ count: 3, period: 30 * day, action: 'Mute' as const, duration: day },
			{ count: 5, period: 0, action: 'Ban' as const, duration: null }
		];

		test('GIVEN a member who reaches a count THEN its threshold is found', () => {
			expect(findReachedWarnThreshold(thresholds, [warning(0), warning(1), warning(2)], now)?.action).toBe('Mute');
		});

		test('GIVEN a member past a count THEN it is not reached again', () => {
			expect(findReachedWarnThreshold(thresholds, [warning(0), warning(1), warning(2), warning(3)], now)).toBeNull();
		});

		test('GIVEN warnings outside the period of a threshold THEN they do not reach it', () => {
			expect(findReachedWarnThreshold(thresholds, [warning(0), warning(40), warning(50)], now)).toBeNull();
		});

		test('GIVEN several thresholds reached at once THEN the highest count wins', () => {
			const both = [
				{ count: 2, period: 0, action: 'Kick' as const, duration: null },
				{ count: 2, period: day, action: 'Timeout' as const, duration: day }
			];
			const entries = [warning(0), warning(0.5)];

			expect(findReachedWarnThreshold([...both, { count: 1, period: 0, action: 'Mute' as const, duration: null }], entries, now)?.count).toBe(
				2
			);
		});
	});
});
