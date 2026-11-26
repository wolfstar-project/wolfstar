import { runOnboardingTimeLimit } from '#lib/onboarding/members';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';

export interface OnboardingTimeLimitPayload {
	/**
	 * The member's row, the only thing the job carries: where they are is read again from it.
	 */
	verificationId: string;
}

/**
 * Fails a member whose time limit in a stage of the onboarding ran out, see `runOnboardingTimeLimit`: an old job does
 * nothing to a member who passed, failed, left or joined again.
 */
export class UserTask extends ScheduledTask<'onboardingTimeLimit'> {
	public constructor(context: ScheduledTask.LoaderContext) {
		super(context, { waitForReady: true });
	}

	public override async run({ verificationId }: OnboardingTimeLimitPayload) {
		const outcome = await runOnboardingTimeLimit(verificationId);
		this.container.logger.debug(`[Onboarding] The time limit of the row ${verificationId}: ${outcome}`);
		return null;
	}
}

declare module '@wolfstar/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		onboardingTimeLimit: OnboardingTimeLimitPayload;
	}
}
