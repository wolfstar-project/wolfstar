import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { ShardChannel } from '@wolfstar/plugin-sharder';
import { red } from 'colorette';
import { getSharderHeader } from './_shared.js';

@ApplyOptions<Listener.Options>({ emitter: 'shardManager', event: 'shardError' })
export class UserSharderListener extends Listener {
	protected readonly title = red('Failed before it was ready');

	public run(channel: ShardChannel, error: unknown) {
		this.container.logger.error(
			`${getSharderHeader(channel.id, this.title)}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
		);
	}
}
