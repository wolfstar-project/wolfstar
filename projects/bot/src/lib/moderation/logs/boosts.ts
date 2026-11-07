import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { getTag } from '#utils/util';
import { time, TimestampStyles, userMention } from '@discordjs/formatters';
import type { User } from '@wolfstar/plugin-gateway';
import type { APIUser, Snowflake } from 'discord-api-types/v10';

/**
 * A change of the boost of a member: they started boosting the server, or stopped. `since` is when the boost started.
 */
export interface BoostChange {
	type: 'start' | 'stop';
	since: number;
}

/**
 * What changed between two values of the time a member boosts the server since (`premium_since`).
 *
 * @remarks
 *
 * Discord only tells since when a member boosts, not how many boosts they gave, so a second boost of a member who
 * already boosts changes nothing and is not seen. A time that changes to another one is a boost that ended and one
 * that started between the two updates, logged as the one that started.
 *
 * @param previous - When the member boosted since before the update, `null` when they did not boost.
 * @param next - When the member boosts since after the update, `null` when they do not boost.
 */
export function getBoostChange(previous: number | null, next: number | null): BoostChange | null {
	if (previous === next) return null;
	if (next !== null) return { type: 'start', since: next };
	return { type: 'stop', since: previous! };
}

/**
 * Sends the log of a boost that started or stopped to the `logs.boosts` channel, when the guild has one.
 *
 * @param guildId - The ID of the guild.
 * @param user - The member who boosts or stopped.
 * @param change - What changed.
 * @param left - Whether the boost stopped because the member left the server.
 */
export async function sendBoostLog(guildId: Snowflake, user: User | APIUser, change: BoostChange, left = false) {
	await sendSimpleLog(guildId, 'logsBoosts', (t) => {
		const since = time(Math.floor(change.since / 1000), TimestampStyles.LongDateTime);
		const member = t('events/guilds-logs:fieldMember', { value: userMention(user.id) });
		if (change.type === 'start') {
			return {
				color: Colors.Pink,
				author: `${getTag(user)} (${user.id})`,
				lines: [member, t('events/guilds-logs:fieldBoostingSince', { value: since })],
				footer: t('events/guilds-logs:boostStart')
			};
		}

		return {
			color: Colors.Red,
			author: `${getTag(user)} (${user.id})`,
			lines: [
				member,
				t('events/guilds-logs:fieldBoostedFor', { duration: Math.max(Date.now() - change.since, 0), since }),
				left ? t('events/guilds-logs:boostStopLeft') : null
			],
			footer: t('events/guilds-logs:boostStop')
		};
	});
}
