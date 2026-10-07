import { getAutoModerationRuleMentions, readAutoModerationRules } from '#lib/moderation/automod/rules';
import { Events } from '#lib/types/Enums';
import type { GuildMessage } from '#lib/types';
import { isModerator } from '#utils/functions';
import { isNullishOrZero } from '@sapphire/utilities';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { AutoModerationRule } from 'wolfstar-database';

/**
 * How many points a mention is worth, a user mention is worth one. They were the `nms` option of the client.
 */
const MentionWeights = { role: 2, everyone: 5 } as const;

@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.GuildUserMessage })
export class UserListener extends Listener {
	public async run(message: GuildMessage) {
		if (!isNullishOrZero(message.editedTimestamp)) return;

		// Without the member the roles and the moderator level cannot be checked, so nobody is moderated by guess:
		const { member } = message;
		if (member === null) return;

		const { roleIds } = member;
		const rules = (await readAutoModerationRules(message.guildId)).filter(
			(rule): rule is AutoModerationRule<'NoMentionSpam'> =>
				rule.type === 'NoMentionSpam' &&
				rule.enabled &&
				!rule.ignoredChannels.includes(message.channelId) &&
				!rule.ignoredRoles.some((id) => roleIds.includes(id))
		);
		if (rules.length === 0) return;
		if (await isModerator(member)) return;

		const mentions =
			message.mentions.users.reduce((acc, user) => (user.bot || user.id === message.author.id ? acc : acc + 1), 0) +
			message.mentions.roleIds.length * MentionWeights.role +
			Number(message.mentions.everyone) * MentionWeights.everyone;

		if (mentions === 0) return;

		// Every rule counts the mentions, the first one that is exceeded bans:
		let warned = false;
		for (const rule of rules) {
			const ctx = getAutoModerationRuleMentions(rule);
			const rateLimit = ctx.acquire(message.author.id);

			try {
				for (let i = 0; i < mentions; i++) rateLimit.consume();
				// Reset time, don't let them relax
				rateLimit.resetTime();
				if (!warned && rule.options.alerts && rateLimit.remaining / ctx.limit <= 0.2) {
					warned = true;
					this.container.client.emit(Events.ModerationMentionSpamWarning, message);
				}
			} catch {
				this.container.client.emit(Events.ModerationMentionSpamExceeded, message, rule);
				return;
			}
		}
	}
}
