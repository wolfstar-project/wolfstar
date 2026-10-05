import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { ShardChannel } from '@wolfstar/plugin-sharder';
import { cyan } from 'colorette';
import { getSharderHeader } from './_shared.js';

@ApplyOptions<Listener.Options>({ emitter: 'shardManager', event: 'shardCreate' })
export class UserSharderListener extends Listener {
	protected readonly title = cyan('Spawned');

	public run(channel: ShardChannel) {
		this.container.logger.info(getSharderHeader(channel.id, this.title));
	}
}
