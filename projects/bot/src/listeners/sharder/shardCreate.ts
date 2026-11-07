import { SharderListener } from '#lib/structures/listeners/SharderListener';
import { ApplyOptions } from '@wolfstar/decorators';
import type { ShardChannel } from '@wolfstar/plugin-sharder';
import { cyan } from 'colorette';
import { getSharderHeader } from './_shared.js';

@ApplyOptions<SharderListener.Options>({ event: 'shardCreate' })
export class UserSharderListener extends SharderListener {
	protected readonly title = cyan('Spawned');

	public run(channel: ShardChannel) {
		this.container.logger.info(getSharderHeader(channel.id, this.title));
	}
}
