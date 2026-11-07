import { isCaseInCourse, scheduleUndoTask } from '#lib/moderation/common/undoTasks';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import { container } from '@wolfstar/http-framework';

describe('undo tasks', () => {
	describe('isCaseInCourse', () => {
		test('GIVEN a temporary case THEN it is in course', () => {
			expect(isCaseInCourse(TypeMetadata.Temporary)).toBe(true);
		});

		test.each([
			['undone', TypeMetadata.Undo],
			['archived', TypeMetadata.Archived],
			['completed', TypeMetadata.Completed]
		])('GIVEN a temporary case that was %s THEN it is not', (_, metadata) => {
			expect(isCaseInCourse(TypeMetadata.Temporary | metadata)).toBe(false);
		});

		test('GIVEN a permanent case THEN it is not', () => {
			expect(isCaseInCourse(TypeMetadata.None)).toBe(false);
		});
	});

	describe('scheduleUndoTask', () => {
		const create = vi.fn().mockResolvedValue(undefined);
		const data = { type: TypeVariation.Ban, id: 4, userId: '1', guildId: '2', duration: 60_000, extraData: null };

		beforeEach(() => {
			create.mockClear();
			(container as { tasks: unknown }).tasks = { create };
		});

		test('GIVEN a case that expires later THEN its job waits for it, with the ID of the case', async () => {
			await scheduleUndoTask({ ...data, expiresAt: Date.now() + 60_000 });

			expect(create).toHaveBeenCalledWith(
				{ name: 'moderationEndBan', payload: { caseID: 4, userID: '1', guildID: '2', duration: 60_000, extraData: null } },
				expect.objectContaining({ repeated: false, customJobOptions: expect.objectContaining({ jobId: 'moderation-2-4' }) })
			);
			expect(create.mock.calls[0][1].delay).toBeGreaterThan(50_000);
		});

		test('GIVEN a case that expired THEN its job runs at once', async () => {
			await scheduleUndoTask({ ...data, expiresAt: Date.now() - 60_000 });
			expect(create.mock.calls[0][1].delay).toBe(0);
		});

		test('GIVEN a type that has nothing to undo THEN there is no job', async () => {
			await scheduleUndoTask({ ...data, type: TypeVariation.Kick, expiresAt: Date.now() });
			expect(create).not.toHaveBeenCalled();
		});
	});
});
