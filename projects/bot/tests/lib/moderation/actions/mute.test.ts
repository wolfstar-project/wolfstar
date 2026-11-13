import { readSettings } from '#lib/database';
import { ModerationActions } from '#lib/moderation/actions';
import { applyMute, fitsTimeout, isMuteTimeout } from '#lib/moderation/actions/mute';
import type { Guild } from '@wolfstar/plugin-gateway';
import { days, hours, seconds } from 'wolfstar-shared';

vi.mock('#lib/database', async (importOriginal) => ({ ...(await importOriginal<object>()), readSettings: vi.fn() }));

const guild = { id: '254360814063058944' } as Guild;
const user = '266624760782258186';
const on = { moderationMuteTimeout: true, rolesMuted: '254360814063058945' };
const off = { moderationMuteTimeout: false, rolesMuted: '254360814063058945' };
const noRole = { moderationMuteTimeout: false, rolesMuted: null };

describe('a mute, with a timeout or the muted role', () => {
	describe('fitsTimeout', () => {
		test('GIVEN a duration Discord takes for a timeout THEN it fits, up to 28 days', () => {
			expect(fitsTimeout(hours(1))).toBe(true);
			expect(fitsTimeout(days(28))).toBe(true);
		});

		test('GIVEN no end, a duration longer than 28 days, or shorter than the timeout allows THEN it does not fit', () => {
			expect(fitsTimeout(null)).toBe(false);
			expect(fitsTimeout(0)).toBe(false);
			expect(fitsTimeout(days(28) + 1)).toBe(false);
			expect(fitsTimeout(seconds(1))).toBe(false);
		});
	});

	describe('isMuteTimeout', () => {
		test('GIVEN the setting on and a duration that fits THEN the mute is a timeout', () => {
			expect(isMuteTimeout(on, hours(1))).toBe(true);
		});

		test('GIVEN the setting on and a permanent or longer mute THEN it takes the role', () => {
			expect(isMuteTimeout(on, null)).toBe(false);
			expect(isMuteTimeout(on, days(30))).toBe(false);
		});

		test('GIVEN the setting off THEN the mute takes the role', () => {
			expect(isMuteTimeout(off, hours(1))).toBe(false);
		});

		// The mute would need the role, which the bot does not set up on its own:
		test('GIVEN no muted role and a duration that fits THEN the mute is a timeout, whatever the setting', () => {
			expect(isMuteTimeout(noRole, hours(1))).toBe(true);
			expect(isMuteTimeout(noRole, null)).toBe(false);
		});
	});

	describe('applyMute', () => {
		const timeout = vi.spyOn(ModerationActions.timeout, 'apply');
		const mute = vi.spyOn(ModerationActions.mute, 'apply');

		beforeEach(() => {
			vi.clearAllMocks();
			timeout.mockResolvedValue('timeout' as never);
			mute.mockResolvedValue('mute' as never);
		});

		test('GIVEN a mute that is a timeout THEN the member is timed out', async () => {
			vi.mocked(readSettings).mockResolvedValue(on as never);

			await expect(applyMute(guild, { user, reason: 'spam', duration: hours(1) })).resolves.toBe('timeout');
			expect(timeout).toHaveBeenCalledWith(guild, { user, reason: 'spam', duration: hours(1) });
			expect(mute).not.toHaveBeenCalled();
		});

		test('GIVEN a mute that is not a timeout THEN the member is given the muted role', async () => {
			vi.mocked(readSettings).mockResolvedValue(on as never);

			await expect(applyMute(guild, { user, reason: 'spam', duration: null })).resolves.toBe('mute');
			expect(mute).toHaveBeenCalledWith(guild, { user, reason: 'spam', duration: null });
			expect(timeout).not.toHaveBeenCalled();
		});
	});
});
