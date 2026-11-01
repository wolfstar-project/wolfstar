import { resolveOnErrorCodes } from '#common';
import { writeSettingsTransaction } from '#lib/database';
import { refreshHoneypotNotice, removeHoneypotNotice, renderHoneypotNotice, withHoneypotLock } from '#lib/moderation/honeypot/channel';
import { fetchGuildT } from '#lib/moderation/common';
import { isNullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import type { HoneypotUpkeep, ReadonlyGuildData } from 'wolfstar-database';

/**
 * The names a honeypot channel that is renamed every day goes through, so the trap cannot be told apart by one name.
 *
 * @remarks
 *
 * They are the channels a bot wants to write in (where the links and the offers go) and no member has a reason to: who
 * writes there is kicked or banned, and a server that keeps no warning tells nobody. A name that invites the members
 * to write (`general-chat`, `introductions`) would catch them, and `honeypot` is the one name the bots learn to skip.
 */
export const HoneypotChannelNames = [
	'self-promo',
	'promotions',
	'paid-promotions',
	'advertise-here',
	'advertising',
	'partnerships',
	'sponsored-links',
	'giveaways',
	'free-stuff',
	'free-nitro',
	'crypto-signals',
	'airdrops'
] as const;

/**
 * What became of the upkeep of a honeypot channel, see {@linkcode runHoneypotUpkeep}.
 */
export type HoneypotUpkeepResult = 'done' | 'gone' | 'skipped' | 'failed';

/**
 * The errors that mean the bot can no longer do something in the channel, which is not a reason to stop the rest of
 * the upkeep.
 */
const IgnoredCodes = [RESTJSONErrorCodes.UnknownMessage, RESTJSONErrorCodes.MissingAccess, RESTJSONErrorCodes.MissingPermissions] as const;

/**
 * The hour of the day, in UTC, the honeypot of a guild is kept up at. The guilds are spread over the day by the time
 * they were created at, so they are not all renamed in the same minute.
 *
 * @param guildId - The ID of the guild.
 */
export function getHoneypotUpkeepHour(guildId: Snowflake): number {
	return Number((BigInt(guildId) >> 22n) % 24n);
}

/**
 * Picks the next name of a honeypot channel, which is never the one it has.
 *
 * @param current - The name the channel has.
 * @param random - A number from 0 to 1, 1 excluded.
 */
export function pickHoneypotChannelName(current: string | null, random = Math.random()): string {
	const names = HoneypotChannelNames.filter((name) => name !== current);
	return names[Math.min(names.length - 1, Math.floor(random * names.length))];
}

/**
 * Keeps a honeypot channel up for the day: it is given another name when the guild wants one, and a new message when
 * the guild keeps it active.
 *
 * @remarks
 *
 * The message is the warning, sent again in the place of the one the channel had. A guild that keeps no warning gets
 * it too, and it is deleted at once: the channel still becomes the latest one that had activity. A channel that was
 * deleted is taken off the settings, so the honeypot is off until it is set up again.
 *
 * The task read the honeypots of every guild before it kept the first one up, and an administrator may have disabled
 * this one, moved it or changed what is done to it since. So the upkeep runs under the lock of the honeypot, as the
 * commands do, and does what the settings say now: a channel that is not the honeypot anymore is not renamed nor
 * written in, and the settings are only cleared of the channel that is gone, not of the one that took its place. While
 * `modules.honeypot` is off the channel is left as it is: it is not renamed, written in, nor taken off when it is gone.
 *
 * @param upkeep - The honeypot channel the task read.
 * @returns `'gone'` when the channel does not exist anymore and the honeypot was turned off, `'skipped'` when the
 * settings changed and there is nothing to do for this channel, `'failed'` when the message of the day could not be
 * sent (the warning the channel had is kept), `'done'` otherwise.
 */
export function runHoneypotUpkeep(upkeep: Pick<HoneypotUpkeep, 'guildId' | 'channelId'>): Promise<HoneypotUpkeepResult> {
	const { guildId, channelId } = upkeep;

	return withHoneypotLock(guildId, async () => {
		const { gatewayClient } = container;

		const settings = await readCurrentSettings(guildId);
		if (settings.honeypotChannel !== channelId || !settings.modulesHoneypot) return 'skipped';
		if (!settings.honeypotRandomName && !settings.honeypotKeepActive) return 'skipped';

		const channel = await resolveOnErrorCodes(gatewayClient.channels.fetch(channelId), RESTJSONErrorCodes.UnknownChannel);
		if (isNullish(channel) || !('guildId' in channel) || channel.guildId !== guildId) {
			const cleared = await clearHoneypotChannel(guildId, channelId);
			return cleared ? 'gone' : 'skipped';
		}

		if (settings.honeypotRandomName) {
			const name = pickHoneypotChannelName(('name' in channel ? channel.name : null) ?? null);
			await resolveOnErrorCodes(gatewayClient.api.channels.edit(channelId, { name }, { reason: 'Honeypot' }), ...IgnoredCodes);
		}

		if (!settings.honeypotKeepActive) return 'done';

		const action = settings.honeypotAction;
		if (settings.honeypotWarning) {
			// The warning the channel had stays when the new one cannot be sent, which the task has to tell about:
			const noticed = await refreshHoneypotNotice(guildId, channelId, { warning: true, action });
			return noticed ? 'done' : 'failed';
		}

		const notice = renderHoneypotNotice(await fetchGuildT({ id: guildId }), action);
		const sent = await resolveOnErrorCodes(gatewayClient.api.channels.createMessage(channelId, notice), ...IgnoredCodes);
		if (sent === null) return 'failed';

		await resolveOnErrorCodes(gatewayClient.messages.delete(channelId, sent.id, 'Honeypot'), ...IgnoredCodes);
		return 'done';
	});
}

/**
 * Reads the settings of a guild as the database has them. The ones a process caches may be a moment behind a write of
 * another shard, and the upkeep must not act on a honeypot that was just disabled.
 */
async function readCurrentSettings(guildId: Snowflake): Promise<ReadonlyGuildData> {
	using trx = await writeSettingsTransaction(guildId);
	return { ...trx.settings };
}

/**
 * Turns the honeypot of a guild off when its channel is gone, and forgets the warning that went with it.
 *
 * @remarks The channel is compared inside the transaction of the settings: an administrator who set the honeypot up
 * again in another channel meanwhile keeps it.
 *
 * @returns Whether the honeypot was turned off.
 */
async function clearHoneypotChannel(guildId: Snowflake, channelId: Snowflake): Promise<boolean> {
	using trx = await writeSettingsTransaction(guildId);
	if (trx.settings.honeypotChannel !== channelId) return false;

	await trx.write({ honeypotChannel: null }).submitWithAudit(container.gatewayClient.user!.id);
	await removeHoneypotNotice(guildId);
	return true;
}
