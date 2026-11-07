import { resolveGuild } from '#common';
import { readSettings } from '#lib/database';
import { bulkDeleteChannelMessages } from '#lib/moderation/cleanup/messages';
import { collectMemberMessages } from '#lib/moderation/histories';
import { minutes } from 'wolfstar-shared';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * How long after the action of the honeypot the messages a member left are looked for: Discord does not always delete
 * everything a ban asked it to, and a message sent while the action was taken is missed by it.
 */
const HoneypotSweepDelay = minutes(2);

/**
 * What the `honeypotSweep` task carries.
 */
export interface HoneypotSweepPayload {
	guildId: Snowflake;
	userId: Snowflake;
	caughtAt: number;
	deleteSeconds: number;
}

/**
 * Schedules the sweep of what a member the honeypot caught left behind, see {@linkcode sweepHoneypotMessages}. A job
 * that cannot be written is only logged: the action was taken, which is what matters.
 */
export async function scheduleHoneypotSweep(payload: HoneypotSweepPayload): Promise<void> {
	try {
		await container.tasks.create({ name: 'honeypotSweep', payload }, { repeated: false, delay: HoneypotSweepDelay });
	} catch (error) {
		container.logger.error(`[Honeypot] Could not schedule the sweep of ${payload.userId} in the guild ${payload.guildId}:`, error);
	}
}

/**
 * Deletes what a member the honeypot caught still has in the channels: the latest page of the channels the bot can
 * read, as `/archive` reads them, deleted in bulk a channel at a time. Nothing is done while `honeypot.ensure-deletion`
 * is off, or the module is, by the time the job runs.
 *
 * @returns How many messages were deleted.
 */
export async function sweepHoneypotMessages({ guildId, userId, caughtAt, deleteSeconds }: HoneypotSweepPayload): Promise<number> {
	const settings = await readSettings(guildId);
	if (!settings.modulesHoneypot || !settings.honeypotEnsureDeletion) return 0;

	const guild = await resolveGuild(guildId);
	// Old queued jobs lack a window; leave them alone rather than delete preserved history.
	if (!Number.isFinite(caughtAt) || !Number.isFinite(deleteSeconds) || deleteSeconds <= 0) return 0;
	const messages = (await collectMemberMessages(guild, userId)).filter((message) => message.createdAt >= caughtAt - deleteSeconds * 1000);
	if (messages.length === 0) return 0;

	const byChannel = new Map<Snowflake, { id: string }[]>();
	for (const message of messages) {
		const list = byChannel.get(message.channelId) ?? [];
		// The bulk deletion only reads the IDs, the rest of a message of the history is not needed:
		list.push(message);
		byChannel.set(message.channelId, list);
	}

	let deleted = 0;
	for (const [channelId, list] of byChannel) {
		try {
			deleted += await bulkDeleteChannelMessages(guildId, channelId, list);
		} catch (error) {
			container.logger.error(`[Honeypot] Could not delete what ${userId} left in ${channelId} of the guild ${guildId}:`, error);
		}
	}

	container.logger.debug(`[Honeypot] Sweep of ${userId} in the guild ${guildId}: ${deleted} messages deleted`);
	return deleted;
}
