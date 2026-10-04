import { envParseInteger, envParseString } from '@wolfstar/env-utilities';
import { container } from '@wolfstar/http-framework';
import { Redis } from 'ioredis';

// Connected by `loadAll()`, it backs the entity cache and the gateway session store:
container.redis = new Redis({
	lazyConnect: true,
	host: envParseString('REDIS_HOST'),
	port: envParseInteger('REDIS_PORT'),
	db: envParseInteger('REDIS_DB'),
	password: envParseString('REDIS_PASSWORD')
});

declare module '@sapphire/pieces' {
	interface Container {
		redis: Redis;
	}
}
