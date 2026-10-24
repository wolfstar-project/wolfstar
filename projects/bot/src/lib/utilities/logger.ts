import { envParseString } from '@wolfstar/env-utilities';
import { LogLevel } from '@wolfstar/http-framework';

const LogLevels = {
	trace: LogLevel.Trace,
	debug: LogLevel.Debug,
	info: LogLevel.Info,
	warn: LogLevel.Warn,
	error: LogLevel.Error,
	fatal: LogLevel.Fatal,
	none: LogLevel.None
} as const;

/**
 * The `logger` option of a client: the logger module of `stars.config.ts` builds the logger from it, and the level is
 * the one of `LOG_LEVEL`. Every client of the process takes it, the one of the shard manager included.
 */
export function getLoggerOptions() {
	return { level: LogLevels[envParseString('LOG_LEVEL', 'info') as keyof typeof LogLevels] };
}
