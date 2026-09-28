// The Stars CLI imports every plugin's `register` entrypoint at build time only, so the type checker never sees the
// `ClientOptions` augmentations those plugins declare unless they are referenced here.
/// <reference types="@wolfstar/plugin-api" />
/// <reference types="@wolfstar/plugin-i18next" />
/// <reference types="@wolfstar/plugin-subcommands-advanced" />
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
	}
}
