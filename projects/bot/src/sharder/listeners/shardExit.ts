import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { ShardChannel } from '@wolfstar/plugin-sharder';
import { red } from 'colorette';
import { getSharderHeader } from './_shared.js';

@ApplyOptions<Listener.Options>({ emitter: 'shardManager', event: 'shardExit' })
export class UserSharderListener extends Listener {
	protected readonly title = red('Exited');

	public run(channel: ShardChannel, code: number | null) {
		this.container.logger.warn(`${getSharderHeader(channel.id, this.title)}: code ${code}`);
	}
}
