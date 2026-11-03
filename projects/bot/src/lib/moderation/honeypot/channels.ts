import { readHoneypotNotice, readHoneypotNotices, refreshHoneypotNotice, removeHoneypotNotice } from './channel';
import type { ReadonlyGuildData } from 'wolfstar-database';

/** The original trap and up to four additional traps share the guild's action and options. */
export function getHoneypotChannels(settings: Pick<ReadonlyGuildData, 'honeypotChannel' | 'honeypotChannels'>): string[] {
	return [...new Set([settings.honeypotChannel, ...(settings.honeypotChannels ?? [])].filter((id): id is string => id !== null))];
}

/** Reconciles additional traps without replacing the original trap's warning. Caller holds the guild honeypot lock. */
export async function syncAdditionalHoneypotNotices(guildId: string, settings: ReadonlyGuildData): Promise<void> {
	const channels = getHoneypotChannels(settings).filter((id) => id !== settings.honeypotChannel);
	for (const [key, notice] of await readHoneypotNotices()) {
		if (key.startsWith(`${guildId}:`) && !channels.includes(notice.channelId)) await removeHoneypotNotice(guildId, notice.channelId);
	}
	for (const channelId of channels) {
		const notice = await readHoneypotNotice(guildId, channelId);
		if (!settings.honeypotWarning) await removeHoneypotNotice(guildId, channelId);
		else if (settings.modulesHoneypot && (notice === null || notice.action !== settings.honeypotAction)) {
			if (!(await refreshHoneypotNotice(guildId, channelId, { warning: true, action: settings.honeypotAction, independent: true }))) {
				throw new Error(`Could not refresh honeypot notice in ${channelId}`);
			}
		}
	}
}
