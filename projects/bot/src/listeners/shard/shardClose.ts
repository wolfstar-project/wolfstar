import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import { red } from 'colorette';
import { getShardHeader } from './_shared.js';

@RegisterAsGatewayListener('shardClose')
export class UserShardListener extends EventGatewayListener<'shardClose'> {
	protected readonly title = red('Disconnected');

	public run(id: number, code: number) {
		// The shard reconnects on its own unless the close code is fatal:
		this.container.logger.warn(`${getShardHeader(id, this.title)}:\n\tCode: ${code}`);
	}
}
