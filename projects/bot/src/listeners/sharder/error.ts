import { SharderListener } from '#lib/structures/listeners/SharderListener';
import { ApplyOptions } from '@wolfstar/decorators';

@ApplyOptions<SharderListener.Options>({ event: 'error' })
export class UserSharderListener extends SharderListener {
	public run(error: unknown) {
		this.container.logger.error(error);
	}
}
