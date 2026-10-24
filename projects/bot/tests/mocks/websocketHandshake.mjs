// A process for `tests/instrumentation.test.ts`, started with the preload: it opens a WebSocket the way `ws` does for
// the gateway of Discord (an `http` request with `Upgrade: websocket`), sends a regular request, then exports its spans.
import { trace } from '@opentelemetry/api';
import { createHash } from 'node:crypto';
import { createServer, get, request } from 'node:http';

const server = createServer((_request, response) => response.writeHead(204).end());
server.on('upgrade', (incoming, socket) => {
	const accept = createHash('sha1').update(`${incoming.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
	socket.end(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

await new Promise((resolve, reject) => {
	const handshake = request({
		hostname: '127.0.0.1',
		port,
		path: '/?v=10&encoding=json',
		headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' }
	});
	handshake.on('upgrade', (_response, socket) => {
		socket.destroy();
		resolve();
	});
	handshake.on('error', reject);
	handshake.end();
});

await new Promise((resolve) =>
	get({ hostname: '127.0.0.1', port, path: '/api/v10/gateway/bot' }, (response) => response.resume().on('end', resolve))
);

server.close();
const provider = trace.getTracerProvider();
await (provider.getDelegate?.() ?? provider).forceFlush?.();
process.exit(0);
