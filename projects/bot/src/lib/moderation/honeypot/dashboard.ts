import { readSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import { refreshHoneypotNotice, removeHoneypotNotice, withHoneypotLock } from '#lib/moderation/honeypot/channel';
import { Events } from '#lib/types/Enums';
import { channelMention } from '@discordjs/formatters';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import type { GuildDataKey, ReadonlyGuildData } from 'wolfstar-database';

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
