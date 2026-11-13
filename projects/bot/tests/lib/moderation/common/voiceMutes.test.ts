import {
	forgetNotVoiceMuted,
	isKnownNotVoiceMuted,
	markNotVoiceMuted,
	shouldRestoreVoiceMute,
	type VoiceStateLike
} from '#lib/moderation/common/voiceMutes';
import { container } from '@wolfstar/http-framework';

describe('voiceMutes', () => {
	const guildId = '254360814063058944';
	const userId = '266624760782258186';

	describe('shouldRestoreVoiceMute', () => {
		function state(channelId: string | null, serverMute = false): VoiceStateLike {
			return { channelId, serverMute };
		}

		test('GIVEN a member who connects to a voice channel THEN the mute is to be given back', () => {
			expect(shouldRestoreVoiceMute(state(null), state('1'))).toBe(true);
		});

		test('GIVEN a member whose previous state was not cached THEN the mute is to be given back', () => {
			expect(shouldRestoreVoiceMute(null, state('1'))).toBe(true);
		});

		test('GIVEN a member who moves to another voice channel THEN the mute is to be given back', () => {
			expect(shouldRestoreVoiceMute(state('1'), state('2'))).toBe(true);
		});

		test('GIVEN a member who stays in their voice channel THEN nothing is done', () => {
			expect(shouldRestoreVoiceMute(state('1'), state('1'))).toBe(false);
		});

		test('GIVEN a member who is unmuted by hand in their voice channel THEN nothing is done', () => {
			expect(shouldRestoreVoiceMute(state('1', true), state('1', false))).toBe(false);
		});

		test('GIVEN a member who connects server muted THEN nothing is done', () => {
			expect(shouldRestoreVoiceMute(state(null), state('1', true))).toBe(false);
		});

		test('GIVEN a member who disconnects THEN nothing is done', () => {
			expect(shouldRestoreVoiceMute(state('1'), state(null))).toBe(false);
			expect(shouldRestoreVoiceMute(state('1'), { channelId: undefined, serverMute: false })).toBe(false);
		});

		test('GIVEN a bot that connects THEN nothing is done', () => {
			expect(shouldRestoreVoiceMute(state(null), state('1'), true)).toBe(false);
		});
	});

	describe('members with no voice mute', () => {
		const stored = new Map<string, { value: string; seconds: number }>();
		const redis = {
			status: 'ready',
			set: async (key: string, value: string, _mode: string, seconds: number) => void stored.set(key, { value, seconds }),
			exists: async (key: string) => (stored.has(key) ? 1 : 0),
			del: async (key: string) => (stored.delete(key) ? 1 : 0)
		};
		let previous: unknown;

		beforeAll(() => {
			previous = (container as any).redis;
			(container as any).redis = redis;
		});

		afterAll(() => {
			(container as any).redis = previous;
		});

		beforeEach(() => {
			stored.clear();
			redis.status = 'ready';
		});

		test('GIVEN a member with no voice mute THEN they are remembered for ten minutes', async () => {
			await expect(isKnownNotVoiceMuted(guildId, userId)).resolves.toBe(false);
			await markNotVoiceMuted(guildId, userId);

			expect([...stored.keys()]).toEqual([`wolfstar:moderation:not-voice-muted:${guildId}:${userId}`]);
			expect([...stored.values()].map((entry) => entry.seconds)).toEqual([600]);
			await expect(isKnownNotVoiceMuted(guildId, userId)).resolves.toBe(true);
			await expect(isKnownNotVoiceMuted(guildId, '1')).resolves.toBe(false);
		});

		test('GIVEN a member who is voice muted THEN they are forgotten', async () => {
			await markNotVoiceMuted(guildId, userId);
			await forgetNotVoiceMuted(guildId, userId);

			await expect(isKnownNotVoiceMuted(guildId, userId)).resolves.toBe(false);
		});

		test('GIVEN no connection THEN nothing is remembered, and the cases are read', async () => {
			redis.status = 'end';
			await markNotVoiceMuted(guildId, userId);

			expect(stored.size).toBe(0);
			await expect(isKnownNotVoiceMuted(guildId, userId)).resolves.toBe(false);
			await expect(forgetNotVoiceMuted(guildId, userId)).resolves.toBeUndefined();
		});
	});
});
