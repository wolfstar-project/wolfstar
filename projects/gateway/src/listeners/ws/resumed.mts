import { makeWebSocketListener } from '#lib/structures/ws-listener';
import { WebSocketShardEvents } from '@discordjs/ws';

export default makeWebSocketListener(WebSocketShardEvents.Resumed, (shardId) => {
	console.log(`[WS] ${shardId} has resumed previous session.`);
});
