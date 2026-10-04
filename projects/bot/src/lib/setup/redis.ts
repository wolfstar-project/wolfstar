import { envParseInteger, envParseString } from '@wolfstar/env-utilities';
import { container } from '@wolfstar/http-framework';
import { Redis, type RedisOptions } from 'ioredis';

const options = {
	lazyConnect: true,
	host: envParseString('REDIS_HOST'),
	port: envParseInteger('REDIS_PORT'),
	db: envParseInteger('REDIS_DB'),
	password: envParseString('REDIS_PASSWORD')
} satisfies RedisOptions;

// Connected by `loadAll()`, it backs the entity cache and the gateway session store:
container.redis = new Redis(options);

// The scheduled tasks run on BullMQ, which needs a connection that never gives up on a command and connects by itself:
container.redisTasks = new Redis({ ...options, maxRetriesPerRequest: null });

declare module '@sapphire/pieces' {
	interface Container {
		redis: Redis;
		redisTasks: Redis;
	}
}
