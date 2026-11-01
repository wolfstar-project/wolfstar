import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { CacheErrorContext } from '@wolfstar/plugin-gateway';

/**
 * Tells a read or a write of the cache that failed: the gateway carries on as if the entry was not cached, so nothing
 * else says it happened.
 */
@RegisterAsGatewayListener('cacheError')
export class UserListener extends EventGatewayListener<'cacheError'> {
	public run(error: unknown, context: CacheErrorContext) {
		this.container.logger.debug(`[Gateway] The cache failed: ${JSON.stringify(context)}`, error);
	}
}
