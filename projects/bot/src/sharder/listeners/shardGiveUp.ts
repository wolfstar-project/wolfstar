import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { ShardChannel } from '@wolfstar/plugin-sharder';
import { red } from 'colorette';
import { getSharderHeader } from './_shared.js';

@ApplyOptions<Listener.Options>({ emitter: 'shardManager', event: 'shardGiveUp' })
export class UserSharderListener extends Listener {
	protected readonly title = red('Given up on');

	public run(channel: ShardChannel, crashes: number) {
		this.container.logger.fatal(`${getSharderHeader(channel.id, this.title)}: ${crashes} crashes`);
	}
}
