import { SharderListener } from '#lib/structures/listeners/SharderListener';
import { ApplyOptions } from '@wolfstar/decorators';
import type { ShardChannel } from '@wolfstar/plugin-sharder';
import { red } from 'colorette';
import { getSharderHeader } from './_shared.js';

@ApplyOptions<SharderListener.Options>({ event: 'shardExit' })
export class UserSharderListener extends SharderListener {
	protected readonly title = red('Exited');

	public run(channel: ShardChannel, code: number | null) {
		this.container.logger.warn(`${getSharderHeader(channel.id, this.title)}: code ${code}`);
	}
}
