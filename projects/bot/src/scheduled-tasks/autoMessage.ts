import { runAutoMessage } from '#lib/automessages/send';
import { readSettings } from '#lib/database';
import { withAutoMessageLock } from '#lib/automessages/store';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';
import type { Snowflake } from 'discord-api-types/v10';
import { deleteAutoMessage, fetchAutoMessage, fetchDueAutoMessages, setAutoMessageNextRun, type AutoMessage } from 'wolfstar-database';

/**
 * How many automatic messages a run takes. They are sent one after the other, and the ones that are left wait for the
 * next minute.
 */
const MessagesPerRun = 25;

/**
 * Sends, every minute, the automatic messages that are due, see `/automessage` and `lib/automessages`.
 *
 * @remarks
 *
 * A message is given its next time before it is sent, so one that fails is not tried again every minute, a restart
 * does not send it twice, and a second run that starts meanwhile does not take it too. Each one is read again under
 * the lock `/automessage` writes with, so one that was disabled or edited after the batch was read is skipped. While
 * `modules.automessage` is off it is given its next time and not sent, so the messages do not all go at once when the
 * module is turned on again.
 */
export class UserTask extends ScheduledTask<'autoMessage'> {
	public constructor(context: ScheduledTask.LoaderContext) {
		super(context, { pattern: '* * * * *', waitForReady: true });
	}

	public override async run() {
		const { prisma, logger } = this.container;
		const now = Date.now();
		for (const due of await fetchDueAutoMessages(prisma.orm, now, MessagesPerRun)) {
			try {
				await withAutoMessageLock(due.guildId, () => this.send(due, now));
			} catch (error) {
				logger.error(`[AutoMessage] Could not send the message of the channel ${due.channelId} of the guild ${due.guildId}:`, error);
			}
		}

		return null;
	}

	private async send(due: AutoMessage, now: number) {
		const { prisma, logger } = this.container;
		// What the database has now: the message may have been disabled, edited or sent by another run meanwhile:
		const message = await fetchAutoMessage(prisma.orm, due.guildId, due.channelId);
		if (message === null || message.id !== due.id || message.nextRunAt > now) return;

		await setAutoMessageNextRun(prisma, message.id, now + message.interval);
		if (!(await readSettings(message.guildId)).modulesAutomessage) return;

		const result = await runAutoMessage(message);
		// A channel that was deleted gets no message anymore:
		if (result === 'gone') await deleteAutoMessage(prisma, message.guildId, message.channelId);
		// It is tried again at the next interval, and is sent once the bot has the permissions back:
		else if (result === 'missing') logger.warn(missingPermissionsMessage(message.guildId, message.channelId));
	}
}

function missingPermissionsMessage(guildId: Snowflake, channelId: Snowflake) {
	return `[AutoMessage] Missing the permissions to send the message of the channel ${channelId} of the guild ${guildId}.`;
}

declare module '@wolfstar/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		autoMessage: never;
	}
}
