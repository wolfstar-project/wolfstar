import { envParseString } from '@wolfstar/env-utilities';

/**
 * The IDs of the bot's owners, read from `CLIENT_OWNERS` (separated by spaces).
 */
export const OWNERS: readonly string[] = envParseString('CLIENT_OWNERS', '').split(' ').filter(Boolean);
