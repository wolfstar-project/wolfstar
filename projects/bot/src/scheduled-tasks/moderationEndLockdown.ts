import { isIgnorableReleaseError, lockdowns, type LockdownTaskPayload } from '#lib/structures/managers/LockdownManager';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';

/**
 * Releases a temporary lockdown when its time is up, see `LockdownManager#add`.
 */
export class UserTask extends ScheduledTask<'moderationEndLockdown'> {
	public override async run({ key }: LockdownTaskPayload) {
		// Released by hand in the meantime:
		const data = await lockdowns.getByKey(key);
		if (data === null) return;

		try {
			await lockdowns.release(data);
		} catch (error) {
			// Anything else fails the job, which BullMQ tries again (see `customJobOptions` in `LockdownManager#add`):
			if (!isIgnorableReleaseError(error)) throw error;

			// What the lockdown was applied to is gone, or out of reach, so there is nothing left to release:
			await lockdowns.remove(data);
		}
	}
}
