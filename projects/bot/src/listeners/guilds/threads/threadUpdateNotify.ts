import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { channelMention } from '@discordjs/formatters';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { AnyThreadChannel } from '@wolfstar/plugin-gateway';

/**
 * Logs what a moderator does to a thread: renaming, archiving and locking it. The other updates of a thread (the count
 * of its messages and members) are not logged.
 */
@RegisterAsDispatchListener('threadUpdate')
export class UserListener extends EventGatewayListener<'threadUpdate'> {
	public async run(previous: AnyThreadChannel | null, next: AnyThreadChannel) {
		// The thread was not cached, there is nothing to compare it with:
		if (previous === null) return;

		await sendSimpleLog(next.guildId, 'logsThreads', (t) => {
			const lines = [
				previous.name === next.name ? null : t('events/guilds-logs:fieldRenamed', { previous: previous.name, next: next.name }),
				previous.archived === next.archived
					? null
					: t(next.archived ? 'events/guilds-logs:threadArchived' : 'events/guilds-logs:threadUnarchived'),
				previous.locked === next.locked ? null : t(next.locked ? 'events/guilds-logs:threadLocked' : 'events/guilds-logs:threadUnlocked')
			];
			if (lines.every((line) => line === null)) return null;

			return {
				color: Colors.Yellow,
				author: `${next.name} (${next.id})`,
				lines: [t('events/guilds-logs:fieldThread', { value: channelMention(next.id) }), ...lines],
				footer: t('events/guilds-logs:threadUpdate')
			};
		});
	}
}
