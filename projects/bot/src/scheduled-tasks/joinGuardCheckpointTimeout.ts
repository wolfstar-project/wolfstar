import { runJoinGuardTimeout } from '#lib/moderation/joinguard/checkpoint';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';

export interface JoinGuardCheckpointTimeoutPayload {
	/**
	 * The row of the queue of the member, the only thing the job carries: what became of them is read again from it.
	 */
	checkpointId: string;
}

/**
 * Kicks a member sent to the checkpoint of the join guard who did not pass it in time, see `runJoinGuardTimeout`: an
 * old job does nothing to a member who was verified, let in, kicked, who left or joined again. A kick that fails is
 * tried again, the job throws.
 */
export class UserTask extends ScheduledTask<'joinGuardCheckpointTimeout'> {
	public constructor(context: ScheduledTask.LoaderContext) {
		super(context, { waitForReady: true });
	}

	public override async run({ checkpointId }: JoinGuardCheckpointTimeoutPayload) {
		const outcome = await runJoinGuardTimeout(checkpointId);
		// The member still waits, with nothing else to kick them: the job is tried again later (`scheduleJoinGuardTimeout`).
		if (outcome.kind === 'Failed') throw new Error(`The timeout of the row ${checkpointId} failed: ${outcome.error}`);
		return null;
	}
}

declare module '@wolfstar/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		joinGuardCheckpointTimeout: JoinGuardCheckpointTimeoutPayload;
	}
}
