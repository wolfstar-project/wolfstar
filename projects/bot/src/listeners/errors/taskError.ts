import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import { ScheduledTaskEvents } from '@wolfstar/plugin-scheduled-tasks';
import type { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';

@ApplyOptions<Listener.Options>({ emitter: 'client', event: ScheduledTaskEvents.ScheduledTaskError })
export class UserListener extends Listener {
	public run(error: unknown, task: ScheduledTask) {
		const message = error instanceof Error ? error.stack || error.message : String(error);
		this.container.logger.fatal(`[TASK] ${task.name}\n${message}`);
	}
}
