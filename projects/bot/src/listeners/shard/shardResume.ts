import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import { yellow } from 'colorette';
import { getShardHeader } from './_shared.js';

@RegisterAsGatewayListener('shardResume')
export class UserShardListener extends EventGatewayListener<'shardResume'> {
	protected readonly title = yellow('Resumed');

	public run(id: number) {
		this.container.logger.info(getShardHeader(id, this.title));
	}
}
