import { Events } from '#lib/types';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';

/**
 * Asks, every minute, for the resource usage to be written to the analytics.
 */
export class UserTask extends ScheduledTask<'syncResourceAnalytics'> {
	public constructor(context: ScheduledTask.LoaderContext) {
		super(context, { pattern: '* * * * *' });
	}

	public override run() {
		this.container.client.emit(Events.ResourceAnalyticsSync);
		return null;
	}
}

declare module '@wolfstar/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		syncResourceAnalytics: never;
	}
}
