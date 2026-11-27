import { canEditCaseDuration, getCaseChanges, getCaseProofProblem, MaximumCaseProofSize, resolveCaseDuration } from '#lib/moderation/caseEdits';
import { ModerationManagerEntry } from '#lib/moderation/managers/ModerationManagerEntry';
import type { ModerationRecord } from '#lib/moderation/managers/ModerationRecord';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import { guild } from '#mocks/MockInstances';

// Echoes the key and its options, the translations are not what is tested here:
const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)) as never;

const record: ModerationRecord = {
	id: 3,
	createdAt: Date.now(),
	duration: null,
	guildId: guild.id,
	moderatorId: '266624760782258186',
	userId: '266624760782258187',
	reason: 'Spam',
	type: TypeVariation.Mute,
	metadata: TypeMetadata.None
};

function createEntry(overrides: Partial<ModerationRecord> = {}) {
	return ModerationManagerEntry.from(guild, { ...record, ...overrides });
}

const before = { reason: 'Spam', duration: 60_000, staffNote: null, proof: null };

describe('getCaseChanges', () => {
	test('GIVEN values the case already has THEN nothing changes', () => {
		expect(getCaseChanges(guild.id, before, { reason: 'Spam', duration: 60_000, staffNote: null })).toEqual([]);
	});

	test('GIVEN a key that is left out THEN it is not a change', () => {
		expect(getCaseChanges(guild.id, before, { reason: 'Spam in #help' })).toEqual([{ field: 'reason', before: 'Spam', after: 'Spam in #help' }]);
	});

	test('GIVEN a duration that is removed THEN the change goes from its milliseconds to nothing', () => {
		expect(getCaseChanges(guild.id, before, { duration: null })).toEqual([{ field: 'duration', before: '60000', after: null }]);
	});

	test('GIVEN a note and a proof THEN the proof is told by the link of its message', () => {
		const changes = getCaseChanges(guild.id, before, { staffNote: 'Second time', proof: { channelId: '1', messageId: '2' } });

		expect(changes).toEqual([
			{ field: 'staffNote', before: null, after: 'Second time' },
			{ field: 'proof', before: null, after: `https://discord.com/channels/${guild.id}/1/2` }
		]);
	});
});

describe('getCaseProofProblem', () => {
	test('GIVEN an image or a video THEN it can be a proof', () => {
		expect(getCaseProofProblem({ size: 1024, content_type: 'image/png' })).toBeNull();
		expect(getCaseProofProblem({ size: 1024, content_type: 'video/mp4' })).toBeNull();
	});

	test('GIVEN another kind of file THEN it is refused', () => {
		expect(getCaseProofProblem({ size: 1024, content_type: 'application/pdf' })).toBe('commands/case:proofInvalidType');
		expect(getCaseProofProblem({ size: 1024 })).toBe('commands/case:proofInvalidType');
	});

	test('GIVEN a file larger than a bot uploads THEN it is refused', () => {
		expect(getCaseProofProblem({ size: MaximumCaseProofSize + 1, content_type: 'image/png' })).toBe('commands/case:proofTooLarge');
	});
});

describe('resolveCaseDuration', () => {
	test('GIVEN nothing THEN the duration is left as it is', () => {
		expect(resolveCaseDuration(t, createEntry(), '')).toBeUndefined();
		expect(resolveCaseDuration(t, createEntry(), null)).toBeUndefined();
	});

	test('GIVEN a time span THEN it is its milliseconds', () => {
		expect(resolveCaseDuration(t, createEntry(), '2h')).toBe(7_200_000);
	});

	test('GIVEN 0 THEN the duration is removed', () => {
		expect(resolveCaseDuration(t, createEntry(), '0')).toBeNull();
	});

	test('GIVEN a duration that would have ended already THEN it is refused', () => {
		const entry = createEntry({ createdAt: Date.now() - 86_400_000 });

		expect(() => resolveCaseDuration(t, entry, '1h')).toThrow(/commands\/case:timeTooEarly/);
	});

	test('GIVEN a type with no undo or a case that ended THEN its duration is not edited', () => {
		const kick = createEntry({ type: TypeVariation.Kick });
		const completed = createEntry({ metadata: TypeMetadata.Completed });

		expect(() => resolveCaseDuration(t, kick, '1h')).toThrow(/commands\/case:timeNotAllowed /);
		expect(() => resolveCaseDuration(t, completed, '1h')).toThrow(/commands\/case:timeNotAllowedInCompletedEntries/);
		expect(canEditCaseDuration(kick)).toBe(false);
		expect(canEditCaseDuration(completed)).toBe(false);
		expect(canEditCaseDuration(createEntry())).toBe(true);
	});
});
