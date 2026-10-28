import { readSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import { isOwnGuild } from '#lib/database/settings/dashboard';
import {
	readHoneypotNotices,
	refreshHoneypotNotice,
	removeHoneypotNotice,
	withHoneypotLock,
	type HoneypotNotice
} from '#lib/moderation/honeypot/channel';
import { onShardMessage } from '#lib/sharder/messages';
import { Events } from '#lib/types/Enums';
import { channelMention } from '@discordjs/formatters';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import { fetchHoneypotChannels, type GuildDataKey, type HoneypotChannel, type ReadonlyGuildData } from 'wolfstar-database';

/**
 * The settings the warning of the honeypot depends on: where it is, whether there is one, and the action it tells
 * about.
 */
export const HoneypotNoticeKeys = ['honeypotChannel', 'honeypotAction', 'honeypotWarning'] as const satisfies readonly GuildDataKey[];

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
 * @param guildId - The guild.
 * @param keys - The keys the dashboard changed.
 */
export async function followHoneypotSettings(guildId: Snowflake, keys: readonly string[]): Promise<HoneypotFollowOutcome> {
	if (!keys.some((key) => (HoneypotNoticeKeys as readonly string[]).includes(key))) return 'Ignored';

	return withHoneypotLock(guildId, async () => {
		const settings = await readSettings(guildId);
		const channelId = settings.honeypotChannel;
		if (channelId === null) {
			await removeHoneypotNotice(guildId);
			return 'Removed';
		}

		const noticed = await refreshHoneypotNotice(guildId, channelId, { warning: settings.honeypotWarning, action: settings.honeypotAction });
		if (noticed) return 'Refreshed';

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
 * read then.
 */
export async function reconcileHoneypotNotices(): Promise<void> {
	const [honeypots, notices] = await Promise.all([fetchHoneypotChannels(container.prisma.orm), readHoneypotNotices()]);
	const byGuild = new Map(honeypots.map((honeypot) => [honeypot.guildId, honeypot]));

	for (const guildId of new Set([...byGuild.keys(), ...notices.keys()])) {
		if (!isOwnGuild(guildId)) continue;
		if (planHoneypotNoticeReconcile(byGuild.get(guildId) ?? null, notices.get(guildId) ?? null) === 'Keep') continue;
		// The rows of a guild the bot left stay, and every request for its channels would be refused:
		if (!(await isGuildJoined(guildId))) continue;

		try {
			await followHoneypotSettings(guildId, HoneypotNoticeKeys);
		} catch (error) {
			container.logger.error(`[Honeypot] Could not put the warning of the guild ${guildId} in order:`, error);
		}
	}
}

async function isGuildJoined(guildId: Snowflake) {
	const { guilds } = container.gatewayClient;
	return Boolean(await guilds.cache.get(guilds.resolveKey(guildId)));
}

onShardMessage('settingsInvalidateAll', () => {
	void reconcileHoneypotNotices().catch((error: unknown) => container.logger.error('[Honeypot] Could not put the warnings in order:', error));
});
