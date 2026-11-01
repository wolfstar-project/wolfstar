import { getHoneypotUpkeepHour, runHoneypotUpkeep } from '#lib/moderation/honeypot/upkeep';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';
import { fetchHoneypotUpkeeps } from 'wolfstar-database';

/**
 * Keeps, every day, the honeypot channels up: the ones with `honeypot.random-name` get another name, and the ones
 * with `honeypot.keep-active` a new message, see `/honeypot` and `lib/moderation/honeypot`.
 *
 * @remarks It runs every hour and takes the guilds whose hour it is ({@linkcode getHoneypotUpkeepHour}), so the
 * channels of every guild are not edited in the same minute.
 */
export class UserTask extends ScheduledTask<'honeypotUpkeep'> {
	public constructor(context: ScheduledTask.LoaderContext) {
		super(context, { pattern: '0 * * * *' });
	}

	public override async run() {
		const { gatewayClient, prisma, logger } = this.container;
		// The guilds of this hour wait for tomorrow, a name that is a day older catches the same bots:
		if (!gatewayClient.isClientReady()) return null;

		const hour = new Date().getUTCHours();
		for (const upkeep of await fetchHoneypotUpkeeps(prisma.orm)) {
			if (getHoneypotUpkeepHour(upkeep.guildId) !== hour) continue;

			try {
				const result = await runHoneypotUpkeep(upkeep);
				logger.debug(`[Honeypot] Upkeep of the channel ${upkeep.channelId} of the guild ${upkeep.guildId}: ${result}`);
				// The channel keeps the warning it had, and the server is not told: the log is where it shows.
				if (result === 'failed') {
					logger.warn(
						`[Honeypot] Could not send the message of the day to the channel ${upkeep.channelId} of the guild ${upkeep.guildId}.`
					);
				}
			} catch (error) {
				logger.error(`[Honeypot] Could not keep up the channel ${upkeep.channelId} of the guild ${upkeep.guildId}:`, error);
			}
		}

		return null;
	}
}

declare module '@wolfstar/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		honeypotUpkeep: never;
	}
}
