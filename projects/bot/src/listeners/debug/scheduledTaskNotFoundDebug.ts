import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import { ScheduledTaskEvents } from '@wolfstar/plugin-scheduled-tasks';

@ApplyOptions<Listener.Options>({ emitter: 'client', event: ScheduledTaskEvents.ScheduledTaskNotFound })
export class UserListener extends Listener {
	public run(task: string) {
		this.container.logger.debug(`[Tasks] ${task}: a job of a task the bot does not have`);
	}
}
