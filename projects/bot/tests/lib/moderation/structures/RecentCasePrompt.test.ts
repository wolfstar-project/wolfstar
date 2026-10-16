import { decodeRecentCaseId, encodeRecentCaseId, findRecentCase } from '#lib/moderation/structures/RecentCasePrompt';

describe('RecentCasePrompt', () => {
	const now = Date.UTC(2026, 9, 16, 12);
	const entry = (id: number, minutesAgo: number, archived = false) => ({
		id,
		createdAt: now - minutesAgo * 60_000,
		isArchived: () => archived
	});

	describe('findRecentCase', () => {
		test('GIVEN a case within the minutes THEN the latest one is found', () => {
			expect(findRecentCase([entry(1, 3), entry(2, 1)], 5, now)?.id).toBe(2);
		});

		test('GIVEN only older cases THEN none is found', () => {
			expect(findRecentCase([entry(1, 10)], 5, now)).toBeNull();
		});

		test('GIVEN an archived case THEN it is not one', () => {
			expect(findRecentCase([entry(1, 1, true)], 5, now)).toBeNull();
		});

		test('GIVEN the setting at 0 THEN it never asks', () => {
			expect(findRecentCase([entry(1, 0)], 0, now)).toBeNull();
		});
	});

	describe('custom IDs', () => {
		const ownerId = '266624760782258186';
		const promptId = '1291234567890123456';

		test('GIVEN an action THEN its custom ID is read back', () => {
			const id = encodeRecentCaseId({ ownerId, verb: 'confirm', promptId });

			expect(id.startsWith('moderationConfirm.')).toBe(true);
			expect(decodeRecentCaseId(id.split('.').slice(1))).toEqual({ ownerId, verb: 'confirm', promptId });
		});

		test('GIVEN something else THEN it decodes to null', () => {
			expect(decodeRecentCaseId(null)).toBeNull();
			expect(decodeRecentCaseId([ownerId, `delete:${promptId}`])).toBeNull();
			expect(decodeRecentCaseId([ownerId, 'confirm:abc'])).toBeNull();
			expect(decodeRecentCaseId([ownerId, 'confirm'])).toBeNull();
		});
	});
});
