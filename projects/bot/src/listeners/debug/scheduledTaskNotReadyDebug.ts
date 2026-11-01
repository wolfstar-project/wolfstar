import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import { ScheduledTaskEvents } from '@wolfstar/plugin-scheduled-tasks';
import type { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';

@ApplyOptions<Listener.Options>({ emitter: 'client', event: ScheduledTaskEvents.ScheduledTaskNotReady })
export class UserListener extends Listener {
	public run(task: ScheduledTask) {
		this.container.logger.debug(`[Tasks] ${task.name}: held back, the gateway is not ready`);
	}
}
