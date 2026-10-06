import { WebSocketShardStatus } from '@discordjs/ws';
import { ClientUser, EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';

/**
 * Makes the client ready when its shards resumed their sessions instead of identifying.
 *
 * @remarks
 *
 * The sessions are kept in Redis, so a restarted process resumes them. Discord then sends `RESUMED` and no `READY`,
 * and the gateway plugin only sets `client.user` and emits `clientReady` from `READY` (plugin-gateway 0.11.0): the
 * client would never be ready, the `ready` listener would never run and the tasks that wait for it would fail forever.
 */
@RegisterAsGatewayListener('shardResume')
export class UserShardListener extends EventGatewayListener<'shardResume'> {
	public async run() {
		const client = this.container.gatewayClient;
		if (client.isClientReady()) return;

		// A shard that is still connecting or identifying makes the client ready by itself, from its `READY`:
		const statuses = await client.gateway.fetchStatus();
		if (![...statuses.values()].every((status) => status === WebSocketShardStatus.Ready)) return;

		client.user ??= new ClientUser(await client.api.users.getCurrent());
		if (client.isClientReady()) return;

		client.clientReadyTimestamp = Date.now();
		client.emit('clientReady', client);
	}
}
