import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';

@ApplyOptions<Listener.Options>({ emitter: 'shardManager', event: 'error' })
export class UserSharderListener extends Listener {
	public run(error: unknown) {
		this.container.logger.error(error);
	}
}
