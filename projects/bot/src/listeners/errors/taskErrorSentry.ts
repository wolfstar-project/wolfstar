import { captureException } from '@sentry/node';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import { ScheduledTaskEvents } from '@wolfstar/plugin-scheduled-tasks';
import type { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';
import { isSentryInitialized } from '@wolfstar/shared-http-pieces';

@ApplyOptions<Listener.Options>(() => ({ emitter: 'client', event: ScheduledTaskEvents.ScheduledTaskError, enabled: isSentryInitialized() }))
export class UserListener extends Listener {
	public run(error: unknown, task: ScheduledTask) {
		captureException(error, { tags: { name: task.name } });
	}
}
