import { runJoinGuardTimeout } from '#lib/moderation/joinguard/checkpoint';
import { UserTask } from '#root/scheduled-tasks/joinGuardCheckpointTimeout';

vi.mock('#lib/moderation/joinguard/checkpoint', () => ({ runJoinGuardTimeout: vi.fn() }));

// The task is run on its prototype, which reads the container every piece reads:
const task = Object.create(UserTask.prototype) as UserTask;

describe('joinGuardCheckpointTimeout', () => {
	test('GIVEN a kick that failed THEN the job throws, so it is tried again while the member waits', async () => {
		vi.mocked(runJoinGuardTimeout).mockResolvedValueOnce({ kind: 'Failed', error: 'Missing Permissions' });

		await expect(task.run({ checkpointId: '5' })).rejects.toThrow('Missing Permissions');
	});

	test.each([{ kind: 'Kicked', caseId: 3 }, { kind: 'Resolved' }, { kind: 'Left' }, { kind: 'LetIn' }] as const)(
		'GIVEN $kind THEN the job is done',
		async (outcome) => {
			vi.mocked(runJoinGuardTimeout).mockResolvedValueOnce(outcome);

			await expect(task.run({ checkpointId: '5' })).resolves.toBeNull();
		}
	);
});
