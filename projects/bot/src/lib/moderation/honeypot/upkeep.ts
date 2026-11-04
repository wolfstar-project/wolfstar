import { getHoneypotChannels } from './channels';
import { resolveOnErrorCodes } from '#common';
import { writeSettingsTransaction } from '#lib/database';
import { refreshHoneypotNotice, removeHoneypotNotice, renderHoneypotNotice, withHoneypotLock } from '#lib/moderation/honeypot/channel';
import { fetchGuildT } from '#lib/moderation/common';
import { isNullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { ChannelType, Routes, RESTJSONErrorCodes, type RESTGetAPIChannelResult, type Snowflake } from 'discord-api-types/v10';
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
 * The characters a chaos name is made of, and how long it is: a name that looks like nothing, which no list of channel
 * names a bot keeps can hold.
 */
const ChaosNameCharacters = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ChaosNameLength = 10;

/**
 * Makes the name of a honeypot channel that is renamed with random characters every day (`honeypot.chaos-name`).
 *
 * @param random - Gives a number from 0 to 1, 1 excluded, for each character.
 */
export function makeChaosChannelName(random = Math.random): string {
	let name = '';
	for (let i = 0; i < ChaosNameLength; i++) {
		name += ChaosNameCharacters[Math.min(ChaosNameCharacters.length - 1, Math.floor(random() * ChaosNameCharacters.length))];
	}
	return name;
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
 * Keeps a honeypot channel up for the day: it is given another name when the guild wants one (from the list, or random
 * characters with `honeypot.chaos-name`), and a new message when the guild keeps it active.
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
	const { guildId } = upkeep;
	let { channelId } = upkeep;

	return withHoneypotLock(guildId, async () => {
		const { gatewayClient } = container;

		const settings = await readCurrentSettings(guildId);
		if (!getHoneypotChannels(settings).includes(channelId) || !settings.modulesHoneypot) return 'skipped';
		if (!settings.honeypotRandomName && !settings.honeypotChaosName && !settings.honeypotKeepActive && !settings.honeypotRecreate)
			return 'skipped';

		const channel = await resolveOnErrorCodes(gatewayClient.channels.fetch(channelId), RESTJSONErrorCodes.UnknownChannel);
		if (isNullish(channel) || !('guildId' in channel) || channel.guildId !== guildId) {
			const cleared = await clearHoneypotChannel(guildId, channelId);
			return cleared ? 'gone' : 'skipped';
		}

		const independent = settings.honeypotChannel !== channelId;
		if (settings.honeypotRecreate) {
			channelId = await recreateHoneypotChannel(guildId, channelId, settings);
			// With a warning, the one sent below is the only one the new channel gets; without it, the warning the old
			// channel had is forgotten here, since the channel went with its message:
			if (!settings.honeypotWarning) {
				await refreshHoneypotNotice(guildId, channelId, { warning: false, action: settings.honeypotAction, independent });
			}
		}

		// The chaos name takes the place of the one of the list while both are on:
		if (settings.honeypotChaosName || settings.honeypotRandomName) {
			const name = settings.honeypotChaosName
				? makeChaosChannelName()
				: pickHoneypotChannelName(('name' in channel ? channel.name : null) ?? null);
			// A rename that fails must not keep the warning from being sent: a recreated trap has no other way to warn
			// whoever writes in it, and the old channel is already gone.
			try {
				await resolveOnErrorCodes(gatewayClient.api.channels.edit(channelId, { name }, { reason: 'Honeypot' }), ...IgnoredCodes);
			} catch (error) {
				container.logger.warn(`[Honeypot] Could not rename the channel ${channelId} of the guild ${guildId}:`, error);
			}
		}

		if (!settings.honeypotKeepActive && !settings.honeypotRecreate) return 'done';

		const action = settings.honeypotAction;
		if (settings.honeypotWarning) {
			// The warning the channel had stays when the new one cannot be sent, which the task has to tell about:
			const noticed = await refreshHoneypotNotice(guildId, channelId, { warning: true, action, independent });
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
	if (!getHoneypotChannels(trx.settings).includes(channelId)) return false;

	const primary = trx.settings.honeypotChannel === channelId;
	await trx
		.write({ ...(primary ? { honeypotChannel: null } : {}), honeypotChannels: trx.settings.honeypotChannels.filter((id) => id !== channelId) })
		.submitWithAudit(container.gatewayClient.user!.id);
	await removeHoneypotNotice(guildId, primary ? undefined : channelId);
	return true;
}

/** Replaces a trap under its guild lock; a failed deletion restores the original configuration. */
async function recreateHoneypotChannel(guildId: string, oldId: string, settings: ReadonlyGuildData): Promise<string> {
	const { gatewayClient } = container;
	const old = (await container.rest.get(Routes.channel(oldId))) as RESTGetAPIChannelResult;
	if (old.type !== ChannelType.GuildText && old.type !== ChannelType.GuildAnnouncement)
		throw new Error('Honeypot recreation requires a text channel');
	const replacement = await gatewayClient.api.guilds.createChannel(
		guildId,
		{
			name: old.name,
			type: old.type,
			parent_id: old.parent_id,
			position: old.position,
			topic: old.topic,
			nsfw: old.nsfw,
			rate_limit_per_user: old.rate_limit_per_user,
			permission_overwrites: old.permission_overwrites
		},
		{ reason: 'Daily honeypot recreation' }
	);
	const primary = settings.honeypotChannel === oldId;
	let saved = false;
	try {
		using trx = await writeSettingsTransaction(guildId);
		if (!getHoneypotChannels(trx.settings).includes(oldId)) throw new Error('Honeypot changed during recreation');
		await trx
			.write({
				...(primary ? { honeypotChannel: replacement.id } : {}),
				honeypotChannels: trx.settings.honeypotChannels.map((id) => (id === oldId ? replacement.id : id))
			})
			.submitWithAudit(gatewayClient.user!.id);
		saved = true;
		await resolveOnErrorCodes(gatewayClient.channels.delete(oldId, 'Daily honeypot recreation'), RESTJSONErrorCodes.UnknownChannel);
	} catch (error) {
		if (saved) {
			using trx = await writeSettingsTransaction(guildId);
			await trx
				.write({
					...(primary && trx.settings.honeypotChannel === replacement.id ? { honeypotChannel: oldId } : {}),
					honeypotChannels: trx.settings.honeypotChannels.map((id) => (id === replacement.id ? oldId : id))
				})
				.submitWithAudit(gatewayClient.user!.id);
		}
		await gatewayClient.channels.delete(replacement.id, 'Honeypot recreation failed');
		throw error;
	}
	await removeHoneypotNotice(guildId, primary ? undefined : oldId);
	return replacement.id;
}
