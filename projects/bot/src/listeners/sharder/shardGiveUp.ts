import { SharderListener } from '#lib/structures/listeners/SharderListener';
import { ApplyOptions } from '@wolfstar/decorators';
import type { ShardChannel } from '@wolfstar/plugin-sharder';
import { red } from 'colorette';
import { getSharderHeader } from './_shared.js';

@ApplyOptions<SharderListener.Options>({ event: 'shardGiveUp' })
export class UserSharderListener extends SharderListener {
	protected readonly title = red('Given up on');

	public run(channel: ShardChannel, crashes: number) {
		this.container.logger.fatal(`${getSharderHeader(channel.id, this.title)}: ${crashes} crashes`);
	}
}
