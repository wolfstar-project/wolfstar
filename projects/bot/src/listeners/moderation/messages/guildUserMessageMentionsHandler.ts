import { readSettings, readSettingsNoMentionSpam } from '#lib/database';
import { Events } from '#lib/types/Enums';
import type { GuildMessage } from '#lib/types';
import { isModerator } from '#utils/functions';
import { isNullishOrZero } from '@sapphire/utilities';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';

/**
 * How many points a mention is worth, a user mention is worth one. They were the `nms` option of the client.
 */
const MentionWeights = { role: 2, everyone: 5 } as const;

@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.GuildUserMessage })
export class UserListener extends Listener {
	public async run(message: GuildMessage) {
		if (!isNullishOrZero(message.editedTimestamp)) return;
		if (await isModerator(message.member)) return;

		const settings = await readSettings(message.guildId);
		if (!settings.noMentionSpamEnabled) return;
		if (settings.noMentionSpamIgnoredChannels.includes(message.channelId)) return;

		const { roleIds } = message.member;
		if (settings.noMentionSpamIgnoredRoles.some((id) => roleIds.includes(id))) return;

		const mentions =
			message.mentions.users.reduce((acc, user) => (user.bot || user.id === message.author.id ? acc : acc + 1), 0) +
			message.mentions.roleIds.length * MentionWeights.role +
			Number(message.mentions.everyone) * MentionWeights.everyone;

		if (mentions === 0) return;

		const ctx = readSettingsNoMentionSpam(settings);
		const rateLimit = ctx.acquire(message.author.id);

		try {
			for (let i = 0; i < mentions; i++) rateLimit.consume();
			// Reset time, don't let them relax
			rateLimit.resetTime();
			if (settings.noMentionSpamAlerts && rateLimit.remaining / ctx.limit <= 0.2) {
				this.container.client.emit(Events.MentionSpamWarning, message);
			}
		} catch {
			this.container.client.emit(Events.MentionSpamExceeded, message);
		}
	}
}
