import { runOnboardingTimeLimit } from '#lib/onboarding/members';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';

export interface OnboardingTimeLimitPayload {
	/**
	 * The member's row: where they are is read again from it.
	 */
	verificationId: string;

	/**
	 * When the job was scheduled to run, in milliseconds since the epoch, which is part of its ID.
	 */
	runAt: number;
}

/**
 * Fails a member whose time limit in a stage of the onboarding ran out, or whose failure action Discord refused, see
 * `runOnboardingTimeLimit`: an old job does nothing to a member who passed, failed, left or joined again. A failure
 * action that Discord refuses is tried again, the job throws.
 */
export class UserTask extends ScheduledTask<'onboardingTimeLimit'> {
	public constructor(context: ScheduledTask.LoaderContext) {
		super(context, { waitForReady: true });
	}

	public override async run({ verificationId, runAt }: OnboardingTimeLimitPayload) {
		const outcome = await runOnboardingTimeLimit(verificationId, runAt);
		this.container.logger.debug(`[Onboarding] The job of the row ${verificationId}: ${outcome}`);
		// The member still waits, and only this job fails them: it is tried again later (`scheduleOnboardingJob`).
		if (outcome === 'Refused') throw new Error(`Discord refused the failure action of the onboarding row ${verificationId}.`);
		return null;
	}
}

declare module '@wolfstar/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		onboardingTimeLimit: OnboardingTimeLimitPayload;
	}
}
