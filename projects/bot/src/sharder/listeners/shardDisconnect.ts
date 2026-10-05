import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { ShardChannel } from '@wolfstar/plugin-sharder';
import { yellow } from 'colorette';
import { getSharderHeader } from './_shared.js';

@ApplyOptions<Listener.Options>({ emitter: 'shardManager', event: 'shardDisconnect' })
export class UserSharderListener extends Listener {
	protected readonly title = yellow('Disconnected');

	public run(channel: ShardChannel) {
		this.container.logger.warn(getSharderHeader(channel.id, this.title));
	}
}
