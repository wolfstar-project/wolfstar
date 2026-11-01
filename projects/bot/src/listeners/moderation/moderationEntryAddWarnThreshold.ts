import type { ModerationManager } from '#lib/moderation';
import { applyWarnThreshold, findReachedWarnThreshold, readWarnThresholds } from '#lib/moderation/warnThresholds';
import { Events } from '#lib/types';
import { getLogPrefix, getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';

/**
 * Takes the action of a threshold of warnings (`/warn-thresholds`) when a warning brings a member to it, whoever gave
 * the warning: a command, a report or the auto-moderation.
 */
@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.ModerationEntryAdd })
export class UserListener extends Listener {
	public async run(entry: ModerationManager.Entry) {
		if (entry.type !== TypeVariation.Warning || entry.isUndo()) return;

		const thresholds = await readWarnThresholds(entry.guild.id);
		if (thresholds.length === 0) return;

		const moderation = await getModeration(entry.guild);
		const entries = await moderation.fetch({ userId: entry.userId });
		const threshold = findReachedWarnThreshold(thresholds, [...entries.values()]);
		if (threshold === null) return;

		this.container.logger.debug(`[MODERATION] ${entry.userId} of ${entry.guild.id} reached the threshold of ${threshold.count} warnings`);
		try {
			await applyWarnThreshold(entry.guild, entry.userId, threshold);
		} catch (error) {
			this.container.logger.error(getLogPrefix(this), `Could not take the action of the threshold of ${threshold.count} warnings:`, error);
		}
	}
}
