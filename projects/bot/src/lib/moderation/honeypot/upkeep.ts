import { resolveOnErrorCodes } from '#common';
import { writeSettings } from '#lib/database';
import { refreshHoneypotNotice, renderHoneypotNotice } from '#lib/moderation/honeypot/channel';
import { fetchGuildT } from '#lib/moderation/common';
import { isNullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import type { HoneypotUpkeep } from 'wolfstar-database';

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
 * @param upkeep - The honeypot channel and what is done to it.
 * @returns `'gone'` when the channel does not exist anymore, `'done'` otherwise.
 */
export async function runHoneypotUpkeep(upkeep: HoneypotUpkeep): Promise<'done' | 'gone'> {
	const { gatewayClient } = container;
	const { guildId, channelId } = upkeep;

	const channel = await resolveOnErrorCodes(gatewayClient.channels.fetch(channelId), RESTJSONErrorCodes.UnknownChannel);
	if (isNullish(channel) || !('guildId' in channel) || channel.guildId !== guildId) {
		await writeSettings(guildId, { honeypotChannel: null }, gatewayClient.user!.id);
		return 'gone';
	}

	if (upkeep.randomName) {
		const name = pickHoneypotChannelName(('name' in channel ? channel.name : null) ?? null);
		await resolveOnErrorCodes(gatewayClient.api.channels.edit(channelId, { name }, { reason: 'Honeypot' }), ...IgnoredCodes);
	}

	if (!upkeep.keepActive) return 'done';
	if (upkeep.warning) {
		await refreshHoneypotNotice(guildId, channelId, upkeep);
		return 'done';
	}

	const notice = renderHoneypotNotice(await fetchGuildT({ id: guildId }), upkeep.action);
	const sent = await resolveOnErrorCodes(gatewayClient.api.channels.createMessage(channelId, notice), ...IgnoredCodes);
	if (sent !== null) await resolveOnErrorCodes(gatewayClient.messages.delete(channelId, sent.id, 'Honeypot'), ...IgnoredCodes);
	return 'done';
}
