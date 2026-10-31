import { SharderListener } from '#lib/structures/listeners/SharderListener';
import { ApplyOptions } from '@wolfstar/decorators';
import type { ShardChannel } from '@wolfstar/plugin-sharder';
import { green } from 'colorette';
import { getSharderHeader } from './_shared.js';

@ApplyOptions<SharderListener.Options>({ event: 'shardReady' })
export class UserSharderListener extends SharderListener {
	protected readonly title = green('Ready');

	public run(channel: ShardChannel) {
		this.container.logger.info(`${getSharderHeader(channel.id, this.title)}: gateway shards ${channel.shards.join(', ')}`);
	}
}
