import { readSettings } from '#lib/database';
import { runAutoPurge } from '#lib/moderation/cleanup/purge';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';
import { deleteAutoPurge, fetchDueAutoPurges, setAutoPurgeNextRun } from 'wolfstar-database';

/**
 * How many purges a run takes. They are run one after the other, and the ones that are left wait for the next minute.
 */
const PurgesPerRun = 10;

/**
 * Runs, every minute, the purges that are due, see `/autopurge` and `lib/moderation/cleanup`.
 *
 * @remarks A purge is given its next time before it runs, so one that fails is not tried again every minute, and so a
 * second run that starts meanwhile does not take it too. While `modules.autopurge` is off it is given its next time and
 * not run, so it does not purge every channel at once when the module is turned on again.
 */
export class UserTask extends ScheduledTask<'autoPurge'> {
	public constructor(context: ScheduledTask.LoaderContext) {
		super(context, { pattern: '* * * * *' });
	}

	public override async run() {
		const { gatewayClient, prisma, logger } = this.container;
		// The purges that are due stay due, the next run takes them:
		if (!gatewayClient.isClientReady()) return null;

		const now = Date.now();
		for (const purge of await fetchDueAutoPurges(prisma.orm, now, PurgesPerRun)) {
			try {
				await setAutoPurgeNextRun(prisma, purge.id, now + purge.interval);
				if (!(await readSettings(purge.guildId)).modulesAutopurge) {
					logger.debug(`[AutoPurge] The channel ${purge.channelId} of ${purge.guildId} was skipped: the module is off`);
					continue;
				}

				const result = await runAutoPurge(purge);
				logger.debug(`[AutoPurge] The channel ${purge.channelId} of ${purge.guildId}: ${result}`);
				// A channel that was deleted is not purged anymore:
				if (result === 'gone') await deleteAutoPurge(prisma, purge.guildId, purge.channelId);
			} catch (error) {
				logger.error(`[AutoPurge] Could not purge the channel ${purge.channelId} of the guild ${purge.guildId}:`, error);
			}
		}

		return null;
	}
}

declare module '@wolfstar/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		autoPurge: never;
	}
}
