import { sweepHoneypotMessages, type HoneypotSweepPayload } from '#lib/moderation/honeypot/sweep';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';

/**
 * Deletes what a member the honeypot caught left in the channels, two minutes after the action, see
 * `honeypot.ensure-deletion` and `sweepHoneypotMessages`.
 */
export class UserTask extends ScheduledTask<'honeypotSweep'> {
	public constructor(context: ScheduledTask.LoaderContext) {
		super(context, { waitForReady: true });
	}

	public override async run(payload: HoneypotSweepPayload) {
		await sweepHoneypotMessages(payload);
		return null;
	}
}

declare module '@wolfstar/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		honeypotSweep: HoneypotSweepPayload;
	}
}
