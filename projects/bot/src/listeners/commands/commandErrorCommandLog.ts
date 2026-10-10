import { ApplyOptions } from '@wolfstar/decorators';
import { Listener, type ClientEventCommandContext } from '@wolfstar/http-framework';
import { makeCommandLogPayload, writeCommandLog } from './_command-log-shared.js';

@ApplyOptions<Listener.Options>({ emitter: 'client', event: 'commandError' })
export class UserListener extends Listener {
	public run(error: unknown, context: ClientEventCommandContext) {
		writeCommandLog(makeCommandLogPayload(context, false, error));
	}
}
