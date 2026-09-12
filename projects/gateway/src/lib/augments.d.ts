import type { IntegerString } from '@wolfstar/env-utilities';

declare module '@wolfstar/env-utilities' {
	interface Env {
		CLIENT_VERSION: string;

		DISCORD_TOKEN: string;

		REDIS_HOST: string;
		REDIS_PORT: IntegerString;
		REDIS_DB: IntegerString;
		REDIS_PASSWORD: string;

		BROKER_STREAM_NAME: string;
		BROKER_BLOCK?: IntegerString;
		BROKER_MAX?: IntegerString;
	}
}
