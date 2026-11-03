import { formatModerationResponse, getModerationResponseKey } from '#lib/moderation/responses';
import { TypeVariation } from '#utils/moderationConstants';

describe('the custom responses of the moderation commands', () => {
	const values = { user: 'wolf#0', reason: 'spam', case: '12', moderator: '<@266624760782258186>', duration: '1 hour' };

	test('GIVEN an action THEN its response is the one of its setting, and the undo of a ban or a mute has its own', () => {
		expect(getModerationResponseKey(TypeVariation.Ban, false)).toBe('messagesResponseBan');
		expect(getModerationResponseKey(TypeVariation.Ban, true)).toBe('messagesResponseUnban');
		expect(getModerationResponseKey(TypeVariation.Softban, false)).toBe('messagesResponseSoftban');
		expect(getModerationResponseKey(TypeVariation.Kick, false)).toBe('messagesResponseKick');
		expect(getModerationResponseKey(TypeVariation.Mute, false)).toBe('messagesResponseMute');
		expect(getModerationResponseKey(TypeVariation.Mute, true)).toBe('messagesResponseUnmute');
	});

	test('GIVEN an action with no custom response THEN the bot writes its own text', () => {
		expect(getModerationResponseKey(TypeVariation.Warning, false)).toBeNull();
		expect(getModerationResponseKey(TypeVariation.Timeout, false)).toBeNull();
		expect(getModerationResponseKey(TypeVariation.Softban, true)).toBeNull();
		expect(getModerationResponseKey(TypeVariation.Kick, true)).toBeNull();
	});

	test('GIVEN the placeholders THEN each is replaced, whatever its case, and the rest is kept', () => {
		expect(formatModerationResponse('{User} was banned by {moderator} for {reason} ({DURATION}), case {case} {other}', values)).toBe(
			'wolf#0 was banned by <@266624760782258186> for spam (1 hour), case 12 {other}'
		);
	});
});
