import type { BooleanString, IntegerString } from '@wolfstar/env-utilities';

declare module '@wolfstar/env-utilities' {
	interface Env {
		CLIENT_VERSION: string;

		SENTRY_DSN?: string;
		API_ENABLED?: BooleanString;
		API_HOST?: string;
		API_ORIGIN?: string;
		API_PORT?: IntegerString;
		API_PREFIX?: string;
		HTTP_ADDRESS?: string;
		HTTP_PORT?: IntegerString;

		DISCORD_TOKEN: string;
		DISCORD_PUBLIC_KEY: string;

		REDIS_HOST: string;
		REDIS_PORT: IntegerString;
		REDIS_DB: IntegerString;
		REDIS_PASSWORD: string;

		BROKER_STREAM_NAME: string;
		BROKER_BLOCK?: IntegerString;
		BROKER_MAX?: IntegerString;
	}
}
