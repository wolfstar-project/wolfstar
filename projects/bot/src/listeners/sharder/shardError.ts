import { SharderListener } from '#lib/structures/listeners/SharderListener';
import { ApplyOptions } from '@wolfstar/decorators';
import type { ShardChannel } from '@wolfstar/plugin-sharder';
import { red } from 'colorette';
import { getSharderHeader } from './_shared.js';

@ApplyOptions<SharderListener.Options>({ event: 'shardError' })
export class UserSharderListener extends SharderListener {
	protected readonly title = red('Failed before it was ready');

	public run(channel: ShardChannel, error: unknown) {
		this.container.logger.error(
			`${getSharderHeader(channel.id, this.title)}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
		);
	}
}
