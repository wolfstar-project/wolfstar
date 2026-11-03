import { syncAdditionalHoneypotNotices } from './channels';
import { readSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import { isOwnGuild } from '#lib/database/settings/dashboard';
import {
	readHoneypotNotice,
	readHoneypotNotices,
	refreshHoneypotNotice,
	removeHoneypotNotice,
	withHoneypotLock,
	type HoneypotNotice
} from '#lib/moderation/honeypot/channel';
import { onShardMessage } from '#lib/sharder/messages';
import { Events } from '#lib/types/Enums';
import { isWorker } from '#utils/worker';
import { channelMention } from '@discordjs/formatters';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import { fetchHoneypotChannels, type GuildDataKey, type HoneypotChannel, type ReadonlyGuildData } from 'wolfstar-database';

/**
 * The settings the warning of the honeypot depends on: where it is, whether there is one, and the action it tells
 * about.
 */
const HoneypotWarningKeys = ['honeypotChannels', 'honeypotChannel', 'honeypotAction', 'honeypotWarning'] as const satisfies readonly GuildDataKey[];

/**
 * The settings {@linkcode followHoneypotSettings} reacts to: the ones of the warning, and the switch of the module,
 * since a warning that waited for it is sent when it is turned on.
 */
export const HoneypotNoticeKeys = [...HoneypotWarningKeys, 'modulesHoneypot'] as const satisfies readonly GuildDataKey[];

/**
 * What following a write of the dashboard did to the warning of the honeypot.
 */
export type HoneypotFollowOutcome = 'Ignored' | 'Removed' | 'Refreshed' | 'Failed';

/**
 * Puts the warning of the honeypot of a guild in order after the dashboard changed its settings, as `/honeypot setup`,
 * `edit` and `disable` do: taken off when the honeypot has no channel anymore, sent again otherwise, which also takes it
 * off the channel the trap left.
 *
 * @remarks
 *
 * It runs under the lock of the honeypot (`withHoneypotLock`) on the settings read inside it, so a command run at the
 * same time does not leave a warning behind. When the warning cannot be sent, nothing is written back: the dashboard
 * checked the permissions when it saved, and the failure is told in the channel of `honeypot.log-channel`, or logged.
 *
 * While `modules.honeypot` is off nothing is sent to the channel (a warning that is not wanted anymore is still taken
 * off), and turning the module on sends the warning only when it is out of step.
 *
 * @param guildId - The guild.
 * @param keys - The keys the dashboard changed.
 */
export async function followHoneypotSettings(guildId: Snowflake, keys: readonly string[]): Promise<HoneypotFollowOutcome> {
	if (!keys.some((key) => (HoneypotNoticeKeys as readonly string[]).includes(key))) return 'Ignored';

	return withHoneypotLock(guildId, async () => {
		const settings = await readSettings(guildId);
		let additionalFailed = false;
		await syncAdditionalHoneypotNotices(guildId, settings).catch((error: unknown) => {
			additionalFailed = true;
			container.logger.error(`[Honeypot] Could not synchronize additional warnings of ${guildId}:`, error);
		});
		const channelId = settings.honeypotChannel;
		if (channelId === null) {
			await removeHoneypotNotice(guildId);
			return additionalFailed ? 'Failed' : 'Removed';
		}

		// A paused honeypot gets no warning, one it does not want anymore is still taken off below:
		if (settings.honeypotWarning && !settings.modulesHoneypot) return additionalFailed ? 'Failed' : 'Ignored';

		// The switch alone: a warning that is right is not sent again, only one that waited for the module is:
		if (!keys.some((key) => (HoneypotWarningKeys as readonly string[]).includes(key))) {
			const honeypot = { channelId, warning: settings.honeypotWarning, action: settings.honeypotAction };
			if (planHoneypotNoticeReconcile(honeypot, await readHoneypotNotice(guildId)) === 'Keep') return additionalFailed ? 'Failed' : 'Ignored';
		}

		const noticed = await refreshHoneypotNotice(guildId, channelId, { warning: settings.honeypotWarning, action: settings.honeypotAction });
		if (noticed) return additionalFailed ? 'Failed' : 'Refreshed';

		await reportNoticeFailure(guildId, channelId, settings);
		return 'Failed';
	});
}

async function reportNoticeFailure(guildId: Snowflake, channelId: Snowflake, settings: ReadonlyGuildData) {
	const guild = settings.honeypotLogChannel === null ? null : await container.gatewayClient.guilds.resolve(guildId);
	if (guild === null) {
		container.logger.warn(
			`[Honeypot] Could not send the warning to the channel ${channelId} of the guild ${guildId} after the dashboard changed it.`
		);
		return;
	}

	const t = await fetchGuildT(guild);
	container.client.emit(Events.GuildMessageLog, guild, settings.honeypotLogChannel, 'honeypotLogChannel', () => ({
		content: t('commands/honeypot:dashboardNoticeFailed', { channel: channelMention(channelId) }),
		allowed_mentions: { parse: [] }
	}));
}

/**
 * What a warning of the honeypot needs: to be kept, sent again (it is missing, in another channel, or tells another
 * action), or taken off (the honeypot is off, or wants none).
 *
 * @param honeypot - The honeypot as the settings have it, `null` when it has no channel.
 * @param notice - The warning the bot keeps for it, `null` when there is none.
 */
export function planHoneypotNoticeReconcile(
	honeypot: Pick<HoneypotChannel, 'channelId' | 'warning' | 'action'> | null,
	notice: HoneypotNotice | null
): 'Keep' | 'Refresh' | 'Remove' {
	if (honeypot === null || !honeypot.warning) return notice === null ? 'Keep' : 'Remove';
	if (notice === null || notice.channelId !== honeypot.channelId) return 'Refresh';
	// A warning sent before its action was kept is taken to tell the right one, rather than sent again for nothing:
	return notice.action !== null && notice.action !== honeypot.action ? 'Refresh' : 'Keep';
}

/**
 * Puts in order the warnings of the honeypots of the guilds of this process, after the connection that hears the
 * dashboard was down: what it changed meanwhile was not heard. A warning that is right is left as it is, so this costs
 * nothing at every start; the others go through {@linkcode followHoneypotSettings}, under the lock and on the settings
 * read then. While `modules.honeypot` is off nothing is sent to the channel, as in `runHoneypotUpkeep`: a warning that
 * is out of step waits for the module (turning it on is a key of {@linkcode HoneypotNoticeKeys}), and only one the
 * settings no longer want is taken off.
 */
export async function reconcileHoneypotNotices(): Promise<void> {
	const [honeypots, notices] = await Promise.all([fetchHoneypotChannels(container.prisma.orm), readHoneypotNotices()]);
	const byGuild = new Map<string, HoneypotChannel[]>();
	for (const honeypot of honeypots) {
		const channels = byGuild.get(honeypot.guildId) ?? [];
		channels.push(honeypot);
		byGuild.set(honeypot.guildId, channels);
	}
	const trackedByGuild = new Map<string, HoneypotNotice[]>();
	for (const [key, notice] of notices) {
		const guildId = key.split(':')[0];
		const tracked = trackedByGuild.get(guildId) ?? [];
		tracked.push(notice);
		trackedByGuild.set(guildId, tracked);
	}
	for (const guildId of new Set([...byGuild.keys(), ...trackedByGuild.keys()])) {
		if (!isOwnGuild(guildId)) continue;
		const channels = byGuild.get(guildId) ?? [];
		const tracked = trackedByGuild.get(guildId) ?? [];
		const needsReconcile =
			channels.some(
				(channel) => planHoneypotNoticeReconcile(channel, tracked.find((notice) => notice.channelId === channel.channelId) ?? null) !== 'Keep'
			) || tracked.some((notice) => !channels.some((channel) => channel.channelId === notice.channelId));
		if (!needsReconcile || !(await isGuildJoined(guildId))) continue;
		try {
			// Recheck every warning under the guild lock; correct primary warnings stay in place.
			await followHoneypotSettings(guildId, ['modulesHoneypot']);
		} catch (error) {
			container.logger.error(`[Honeypot] Could not put the warnings of the guild ${guildId} in order:`, error);
		}
	}
}

async function isGuildJoined(guildId: Snowflake) {
	const { guilds } = container.gatewayClient;
	return Boolean(await guilds.cache.get(guilds.resolveKey(guildId)));
}

// A worker of the broker has no guild of its own (`isOwnGuild`), the gateway puts the warnings in order:
onShardMessage('settingsInvalidateAll', () => {
	if (isWorker()) return;
	void reconcileHoneypotNotices().catch((error: unknown) => container.logger.error('[Honeypot] Could not put the warnings in order:', error));
});
