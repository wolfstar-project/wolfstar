import { readSettings } from '#lib/database';
import {
	countActiveWarnings,
	findReachedWarnThreshold,
	getDefaultWarnThresholds,
	resolveWarnThresholds,
	type WarningCase
} from '#lib/moderation/warnThresholds';
import { TypeVariation } from '#utils/moderationConstants';
import { fetchWarnThresholds } from 'wolfstar-database';

vi.mock('#lib/database', () => ({ readSettings: vi.fn() }));
vi.mock('wolfstar-database', async (importOriginal) => ({ ...(await importOriginal<object>()), fetchWarnThresholds: vi.fn() }));

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

	describe('getDefaultWarnThresholds', () => {
		test('GIVEN a muted role THEN the third warning mutes, the fifth kicks and the seventh bans', () => {
			expect(getDefaultWarnThresholds('1')).toEqual([
				{ count: 3, period: 0, action: 'Mute', duration: 1_800_000 },
				{ count: 5, period: 0, action: 'Kick', duration: null },
				{ count: 7, period: 0, action: 'Ban', duration: null }
			]);
		});

		test('GIVEN no muted role THEN the third warning times out instead', () => {
			expect(getDefaultWarnThresholds(null)[0]).toEqual({ count: 3, period: 0, action: 'Timeout', duration: 1_800_000 });
		});
	});

	describe('resolveWarnThresholds', () => {
		const settings = (moderationDefaultWarnThresholds: boolean, rolesMuted: string | null = null) =>
			({ moderationDefaultWarnThresholds, rolesMuted }) as never;

		test('GIVEN a server with thresholds of its own THEN its list is the whole list', async () => {
			const own = [{ count: 2, period: 0, action: 'Kick' as const, duration: null }];
			vi.mocked(fetchWarnThresholds).mockResolvedValue(own);
			vi.mocked(readSettings).mockResolvedValue(settings(true));

			expect(await resolveWarnThresholds('254360814063058944')).toEqual({ thresholds: own, defaults: false });
		});

		test('GIVEN a server with none THEN it is held to the defaults while it wants them', async () => {
			vi.mocked(fetchWarnThresholds).mockResolvedValue([]);
			vi.mocked(readSettings).mockResolvedValue(settings(true, '1'));

			expect(await resolveWarnThresholds('254360814063058945')).toEqual({ thresholds: getDefaultWarnThresholds('1'), defaults: true });
		});

		test('GIVEN a server with none that turned the defaults off THEN it has none', async () => {
			vi.mocked(fetchWarnThresholds).mockResolvedValue([]);
			vi.mocked(readSettings).mockResolvedValue(settings(false));

			expect(await resolveWarnThresholds('254360814063058946')).toEqual({ thresholds: [], defaults: false });
		});
	});
});
