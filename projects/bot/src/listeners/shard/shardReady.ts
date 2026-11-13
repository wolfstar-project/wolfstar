import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import { green } from 'colorette';
import { getShardHeader } from './_shared.js';

@RegisterAsGatewayListener('shardReady')
export class UserShardListener extends EventGatewayListener<'shardReady'> {
	protected readonly title = green('Ready');

	public run(id: number) {
		this.container.logger.info(getShardHeader(id, this.title));
	}
}
