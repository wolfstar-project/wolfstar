import { all } from '#lib/actions/All';
import { makeWebSocketListener } from '#lib/structures/ws-listener';
import { WebSocketShardEvents } from '@discordjs/ws';

export default makeWebSocketListener(WebSocketShardEvents.Dispatch, (payload) => {
	return all(payload);
});
