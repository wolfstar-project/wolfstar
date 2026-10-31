import { readSettings, writeSettings } from '#lib/database';
import {
	getMissingHoneypotLogPermissions,
	getMissingHoneypotPermissions,
	refreshHoneypotNotice,
	removeHoneypotNotice,
	withHoneypotLock
} from '#lib/moderation/honeypot/channel';
import { HoneypotRoot } from '#lib/moderation/honeypot/commands';
import type { Translator } from '#lib/structures/commands/utils';
import { channelMention } from '@discordjs/formatters';
import type { Snowflake } from 'discord-api-types/v10';
import type { GuildData, ReadonlyGuildData } from 'wolfstar-database';

const Root = HoneypotRoot;

/**
 * The settings of the honeypot, which {@linkcode writeHoneypotSettings} writes.
 */
export const HoneypotSettingKeys = [
	'honeypotChannel',
	'honeypotLogChannel',
	'honeypotAction',
	'honeypotDirectMessage',
	'honeypotWarning',
	'honeypotRandomName',
	'honeypotKeepActive'
] as const satisfies readonly (keyof ReadonlyGuildData)[];

/**
 * Whether a write of the settings changes one of the honeypot.
 *
 * @param keys - The keys the write sets.
 */
export function isHoneypotSettingsWrite(keys: readonly string[]): boolean {
	return keys.some((key) => (HoneypotSettingKeys as readonly string[]).includes(key));
}

/**
 * What {@linkcode writeHoneypotSettings} did: `error` when it wrote nothing, and what the user is told otherwise.
 */
export type HoneypotSettingsResult = { ok: true; notes: string[] } | { ok: false; error: string };

/**
 * Writes settings of the honeypot as the `/honeypot` commands do, for the writes that are not made by them (the
 * settings menu): the checks they make before they write, then the warning of the channel.
 *
 * @remarks
 *
 * - A new channel, or a new action while there is a channel, needs the permissions of the honeypot in it
 *   (`getMissingHoneypotPermissions`), and the channel the catches are reported to needs the ones to post there
 *   (`getMissingHoneypotLogPermissions`). The two cannot be the same channel.
 * - The warning is sent again when the channel, the warning or the action it tells about changes, and taken off when
 *   the honeypot has no channel anymore (`refreshHoneypotNotice`, `removeHoneypotNotice`).
 *
 * Everything runs under the lock of the honeypot (`withHoneypotLock`) on the settings read inside it, as the commands
 * do, so a write of the menu and a `/honeypot disable` at the same time do not leave a warning in a channel that is no
 * longer a trap.
 *
 * @param guildId - The guild of the honeypot.
 * @param data - What to write, or a function that computes it from the settings read under the lock.
 * @param actorId - Who writes, for the audit log.
 * @param t - The function to translate the answers with.
 */
export async function writeHoneypotSettings(
	guildId: Snowflake,
	data: Partial<GuildData> | ((settings: ReadonlyGuildData) => Partial<GuildData>),
	actorId: string,
	t: Translator
): Promise<HoneypotSettingsResult> {
	return withHoneypotLock(guildId, async () => {
		const settings = await readSettings(guildId);
		const changes = typeof data === 'function' ? data(settings) : data;
		const changed = (key: keyof GuildData) => key in changes && changes[key] !== settings[key];
		const next = { ...settings, ...changes } as ReadonlyGuildData;

		const error = await checkHoneypotSettings(guildId, next, changed, t);
		if (error !== null) return { ok: false, error };

		await writeSettings(guildId, changes, actorId);
		const written = await readSettings(guildId);

		const notes: string[] = [];
		// The channel is read after the write, which is the one the honeypot has now:
		if (written.honeypotChannel === null) {
			if (changed('honeypotChannel')) await removeHoneypotNotice(guildId);
		} else if (changed('honeypotChannel') || changed('honeypotWarning') || changed('honeypotAction')) {
			const noticed = await refreshHoneypotNotice(guildId, written.honeypotChannel, {
				warning: written.honeypotWarning,
				action: written.honeypotAction
			});
			if (!noticed) notes.push(t(`${Root}:setupNoticeFailed`));
		}

		return { ok: true, notes };
	});
}

/**
 * Reads why the settings of the honeypot cannot be written, see {@linkcode writeHoneypotSettings}.
 *
 * @returns The reason, `null` when they can be.
 */
async function checkHoneypotSettings(
	guildId: Snowflake,
	next: ReadonlyGuildData,
	changed: (key: keyof GuildData) => boolean,
	t: Translator
): Promise<string | null> {
	const channelId = next.honeypotChannel;
	const logsId = next.honeypotLogChannel;

	if ((changed('honeypotChannel') || changed('honeypotLogChannel')) && channelId !== null && channelId === logsId) {
		return t(`${Root}:menuLogsSameChannel`);
	}

	// A channel the bot cannot write in would be saved, and every report dropped without a word:
	if (changed('honeypotLogChannel') && logsId !== null) {
		const lacking = await getMissingHoneypotLogPermissions(guildId, logsId);
		if (lacking === null) return t(`${Root}:channelUnknown`);
		if (lacking.length > 0) return t(`${Root}:logsMissingPermissions`, { channel: channelMention(logsId), missing: lacking });
	}

	// Another channel, or another action, needs its permissions before the honeypot stops working:
	if ((changed('honeypotChannel') || changed('honeypotAction')) && channelId !== null) {
		const missing = await getMissingHoneypotPermissions(guildId, channelId, next.honeypotAction);
		if (missing === null) return t(`${Root}:channelUnknown`);
		if (missing.length > 0) return t(`${Root}:missingPermissions`, { channel: channelMention(channelId), missing });
	}

	return null;
}
