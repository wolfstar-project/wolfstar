import { ApplyOptions } from '@wolfstar/decorators';
import { Listener, type ClientEventCommandContext } from '@wolfstar/http-framework';
import { trackCommandStart } from './_command-log-shared.js';

/**
 * Records when a command starts, for the latency of its row in the command log: the framework's events do not carry
 * how long the command ran for.
 */
@ApplyOptions<Listener.Options>({ emitter: 'client', event: 'commandRun' })
export class UserListener extends Listener {
	public run(context: ClientEventCommandContext) {
		trackCommandStart(context);
	}
}
