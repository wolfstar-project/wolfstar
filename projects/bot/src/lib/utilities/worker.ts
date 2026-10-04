import { envParseString } from '@wolfstar/env-utilities';

/**
 * Whether this process is a worker: it never connects to Discord, it replays the dispatches the gateway process
 * forwards onto the broker's stream (see `BROKER_ENABLED`) on a client sharing its Redis cache.
 */
export const isWorker = () => envParseString('BOT_MODE', 'gateway') === 'worker';
