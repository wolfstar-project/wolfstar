import { hours } from '#common';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * How many clicks on a settings menu that expired are answered, the ones after them are only acknowledged.
 */
export const MaximumSettingsExpiredNotices = 5;

/**
 * How long the clicks on an expired menu are counted for.
 */
const SettingsExpiredNoticesLifetime = hours(1);

/**
 * Counts a click on a settings menu that expired, and says whether it is answered: the first ones are told that the
 * menu closed, and who keeps clicking is not told again.
 *
 * @remarks The count is in Redis, since the menu keeps no state. Without a connection (the tests) every click is
 * answered.
 *
 * @param messageId - The message of the menu.
 * @param userId - The user who clicked.
 */
export async function claimSettingsExpiredNotice(messageId: Snowflake, userId: Snowflake): Promise<boolean> {
	const { redis } = container;
	if (redis?.status !== 'ready') return true;

	const key = `wolfstar:settings-menu:expired:${messageId}:${userId}`;
	const clicks = await redis.incr(key);
	if (clicks === 1) await redis.pexpire(key, SettingsExpiredNoticesLifetime);

	return clicks <= MaximumSettingsExpiredNotices;
}
