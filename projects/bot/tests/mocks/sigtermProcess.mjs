// A process for `tests/instrumentation.test.ts`, started with the preload: it stays alive until a signal ends it, as the
// bot does with its sockets open. With `broker`, it handles `SIGTERM` as the broker consumer of a worker does: it raises
// the signal again once it is done, when nothing else listens to it any more.
if (process.argv[2] === 'broker') {
	process.once('SIGTERM', () => {
		setTimeout(() => {
			if (process.listenerCount('SIGTERM') === 0) process.kill(process.pid, 'SIGTERM');
		}, 50);
	});
}

setInterval(() => undefined, 1000);
process.stdout.write('ready\n');
