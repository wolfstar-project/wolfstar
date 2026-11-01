import { describeDispatch } from '#utils/debug';
import { LogLevel } from '@wolfstar/http-framework';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GatewayDispatchPayload } from 'discord-api-types/v10';

/**
 * Tells every dispatch that reaches the process, before anything else looks at it: what is not here did not come from
 * Discord, and what is here and went no further stopped in the bot.
 */
@RegisterAsGatewayListener('raw')
export class UserListener extends EventGatewayListener<'raw'> {
	public run(payload: GatewayDispatchPayload, shardId: number) {
		const { logger } = this.container;
		if (logger.has(LogLevel.Debug)) logger.debug(`[Gateway] Shard ${shardId}: ${describeDispatch(payload)}`);
	}
}
