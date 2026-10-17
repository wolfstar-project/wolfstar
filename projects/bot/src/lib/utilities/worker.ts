import { envParseBoolean, envParseString } from '@wolfstar/env-utilities';
import { RegisterAsGatewayListener, type EventGatewayListener, type GatewayEventName } from '@wolfstar/plugin-gateway';

/**
 * Whether this process is a worker: it never connects to Discord, it replays the dispatches the gateway process
 * forwards onto the broker's stream (see `BROKER_ENABLED`) on a client sharing its Redis cache.
 */
export const isWorker = () => envParseString('BOT_MODE', 'gateway') === 'worker';

/**
 * Whether this process is the gateway and forwards every dispatch onto the broker's stream, for the workers to handle.
 */
export const forwardsDispatches = () => !isWorker() && envParseBoolean('BROKER_ENABLED', false);

/**
 * Registers a listener of an event of the gateway that comes from a dispatch of Discord (a message, a member, a
 * role…), which only one process handles: the workers when the gateway forwards the dispatches to them, the gateway
 * otherwise.
 *
 * @remarks
 *
 * A worker replays every dispatch the gateway forwards (`replayGatewayDispatches`), and the gateway's client emits the
 * same events, so a listener both load would act twice: two deletions, two cases. On the gateway that forwards them
 * the listener is not loaded. The events of the gateway itself (`clientReady`, the ones of the shards) are not
 * replayed, and their listeners keep `RegisterAsGatewayListener`.
 *
 * @param event - The event to listen to.
 * @param options - The options of the listener, see `RegisterAsGatewayListener`.
 */
export function RegisterAsDispatchListener<Event extends GatewayEventName>(
	event: Event,
	options: Omit<EventGatewayListener.Options<Event>, 'event'> = {}
) {
	return RegisterAsGatewayListener(event, { ...options, enabled: options.enabled !== false && !forwardsDispatches() });
}
