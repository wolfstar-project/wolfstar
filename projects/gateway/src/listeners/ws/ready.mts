import { makeWebSocketListener } from '#lib/structures/ws-listener';
import { WebSocketShardEvents } from '@discordjs/ws';

export default makeWebSocketListener(WebSocketShardEvents.Ready, (_data, shardId) => {
	console.log(`[WS] ${shardId} is now ready.`);
});
