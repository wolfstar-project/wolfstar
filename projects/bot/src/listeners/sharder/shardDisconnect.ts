import { SharderListener } from '#lib/structures/listeners/SharderListener';
import { ApplyOptions } from '@wolfstar/decorators';
import type { ShardChannel } from '@wolfstar/plugin-sharder';
import { yellow } from 'colorette';
import { getSharderHeader } from './_shared.js';

@ApplyOptions<SharderListener.Options>({ event: 'shardDisconnect' })
export class UserSharderListener extends SharderListener {
	protected readonly title = yellow('Disconnected');

	public run(channel: ShardChannel) {
		this.container.logger.warn(getSharderHeader(channel.id, this.title));
	}
}
