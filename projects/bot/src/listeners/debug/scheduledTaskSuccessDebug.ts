import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import { ScheduledTaskEvents } from '@wolfstar/plugin-scheduled-tasks';
import type { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';

@ApplyOptions<Listener.Options>({ emitter: 'client', event: ScheduledTaskEvents.ScheduledTaskSuccess })
export class UserListener extends Listener {
	public run(task: ScheduledTask, _payload: unknown, _result: unknown, duration: number) {
		this.container.logger.debug(`[Tasks] ${task.name}: done in ${Math.round(duration)}ms`);
	}
}
