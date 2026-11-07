import { envParseBoolean, envParseString } from '@wolfstar/env-utilities';

/**
 * Whether this process is a worker: it never connects to Discord, it replays the dispatches the gateway process
 * forwards onto the broker's stream (see `BROKER_ENABLED`) on a client sharing its Redis cache.
 */
export const isWorker = () => envParseString('BOT_MODE', 'gateway') === 'worker';

/**
 * Whether this process is the gateway and forwards every dispatch onto the broker's stream, for the workers to handle.
 */
export const forwardsDispatches = () => !isWorker() && envParseBoolean('BROKER_ENABLED', false);
