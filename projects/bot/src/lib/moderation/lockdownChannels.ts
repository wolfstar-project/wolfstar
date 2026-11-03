import type { Translator } from '#lib/structures/commands/utils';
import { channelMention, roleMention } from '@discordjs/formatters';
import type { Snowflake } from 'discord-api-types/v10';

const Root = 'commands/lockdown';

/**
 * What came of locking down, or unlocking, one channel.
 *
 * - `done`: the channel was changed.
 * - `already`: it was already as asked, and was left alone.
 * - `unmanageable`: the bot lacks `Manage Channels` or `Manage Roles` in it.
 * - `unknown`: the channel is gone, or is not one a lockdown applies to.
 * - `failed`: Discord refused for another reason, which was logged.
 */
export type LockdownChannelOutcome = 'done' | 'already' | 'unmanageable' | 'unknown' | 'failed';

/**
 * The outcome of one channel of `moderation.lockdown-channels`.
 */
export interface LockdownChannelResult {
	readonly channelId: Snowflake;
	readonly outcome: LockdownChannelOutcome;
}

/**
 * The line that tells what came of one channel, the same the command answers with for a `channel:` option.
 *
 * @param t - The function to translate with.
 * @param action - Whether the channel was being locked or unlocked.
 * @param outcome - What came of it.
 * @param channelId - The channel.
 * @param roleId - The role that was locked down in it.
 */
export function describeLockdownChannelOutcome(
	t: Translator,
	action: 'lock' | 'unlock',
	outcome: LockdownChannelOutcome,
	channelId: Snowflake,
	roleId: Snowflake
): string {
	const channel = channelMention(channelId);
	const role = roleMention(roleId);
	switch (outcome) {
		case 'done':
			return t(`${Root}:successChannel`, { channel, role });
		case 'already':
			return t(action === 'lock' ? `${Root}:channelLocked` : `${Root}:channelUnlocked`, { channel, role });
		case 'unmanageable':
			return t(`${Root}:channelUnmanageable`, { channel });
		case 'unknown':
			return t(`${Root}:channelUnknownChannel`, { channel });
		case 'failed':
			return t(action === 'lock' ? `${Root}:channelLockFailed` : `${Root}:channelUnlockFailed`, { channel });
	}
}

/**
 * The most channels the answer lists with why they could not be changed: a message holds 2000 characters, and the
 * line of a channel the bot cannot manage is over a hundred.
 */
export const MaximumListedLockdownFailures = 10;

/**
 * One answer for the channels of `moderation.lockdown-channels`: how many were changed, how many were already as
 * asked, and a line for each one that could not be changed, with why, up to {@linkcode MaximumListedLockdownFailures}
 * and then how many more there are.
 *
 * @param t - The function to translate with.
 * @param action - Whether the channels were being locked or unlocked.
 * @param roleId - The role that was locked down in them.
 * @param results - What came of each channel.
 */
export function summarizeLockdownChannels(
	t: Translator,
	action: 'lock' | 'unlock',
	roleId: Snowflake,
	results: readonly LockdownChannelResult[]
): string {
	const role = roleMention(roleId);
	const done = results.filter((result) => result.outcome === 'done').length;
	const already = results.filter((result) => result.outcome === 'already').length;
	const failures = results.filter((result) => result.outcome !== 'done' && result.outcome !== 'already');

	const lines = [t(action === 'lock' ? `${Root}:configuredLocked` : `${Root}:configuredUnlocked`, { count: done, role })];
	if (already > 0) lines.push(t(action === 'lock' ? `${Root}:configuredAlreadyLocked` : `${Root}:configuredAlreadyUnlocked`, { count: already }));
	if (failures.length > 0) {
		lines.push(t(`${Root}:configuredFailed`));
		for (const { channelId, outcome } of failures.slice(0, MaximumListedLockdownFailures)) {
			lines.push(`- ${describeLockdownChannelOutcome(t, action, outcome, channelId, roleId)}`);
		}
		const more = failures.length - MaximumListedLockdownFailures;
		if (more > 0) lines.push(t(`${Root}:configuredFailedMore`, { count: more }));
	}

	return lines.join('\n');
}
