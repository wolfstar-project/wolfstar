import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import { red } from 'colorette';
import { getShardHeader } from './_shared.js';

@RegisterAsGatewayListener('shardError')
export class UserShardListener extends EventGatewayListener<'shardError'> {
	protected readonly title = red('Error');

	public run(error: Error, id: number) {
		this.container.logger.error(`${getShardHeader(id, this.title)}: ${error.stack ?? error.message}`);
	}
}
