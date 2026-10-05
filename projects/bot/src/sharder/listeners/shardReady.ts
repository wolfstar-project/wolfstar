import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { ShardChannel } from '@wolfstar/plugin-sharder';
import { green } from 'colorette';
import { getSharderHeader } from './_shared.js';

@ApplyOptions<Listener.Options>({ emitter: 'shardManager', event: 'shardReady' })
export class UserSharderListener extends Listener {
	protected readonly title = green('Ready');

	public run(channel: ShardChannel) {
		this.container.logger.info(`${getSharderHeader(channel.id, this.title)}: gateway shards ${channel.shards.join(', ')}`);
	}
}
