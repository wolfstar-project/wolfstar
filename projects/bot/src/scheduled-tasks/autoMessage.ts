import { runAutoMessage } from '#lib/automessages/send';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';
import { deleteAutoMessage, fetchDueAutoMessages, setAutoMessageNextRun } from 'wolfstar-database';

/**
 * How many automatic messages a run takes. They are sent one after the other, and the ones that are left wait for the
 * next minute.
 */
const MessagesPerRun = 25;

/**
 * Sends, every minute, the automatic messages that are due, see `/automessage` and `lib/automessages`.
 *
 * @remarks A message is given its next time before it is sent, so one that fails is not tried again every minute, a
 * restart does not send it twice, and a second run that starts meanwhile does not take it too.
 */
export class UserTask extends ScheduledTask<'autoMessage'> {
	public constructor(context: ScheduledTask.LoaderContext) {
		super(context, { pattern: '* * * * *' });
	}

	public override async run() {
		const { gatewayClient, prisma, logger } = this.container;
		// The messages that are due stay due, the next run takes them:
		if (!gatewayClient.isClientReady()) return null;

		const now = Date.now();
		for (const message of await fetchDueAutoMessages(prisma.orm, now, MessagesPerRun)) {
			try {
				await setAutoMessageNextRun(prisma, message.id, now + message.interval);
				// A channel that was deleted gets no message anymore:
				if ((await runAutoMessage(message)) === 'gone') await deleteAutoMessage(prisma, message.guildId, message.channelId);
			} catch (error) {
				logger.error(`[AutoMessage] Could not send the message of the channel ${message.channelId} of the guild ${message.guildId}:`, error);
			}
		}

		return null;
	}
}

declare module '@wolfstar/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		autoMessage: never;
	}
}
