import { AutoModerationRuleListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import type { AutoModerationRule } from 'wolfstar-database';

export class UserModerationMessageListener extends AutoModerationRuleListener<'MassMentions'> {
	public constructor(context: AutoModerationRuleListener.LoaderContext) {
		super(context, 'MassMentions');
	}

	protected detect(message: GuildMessage, rule: AutoModerationRule<'MassMentions'>): boolean {
		// The collection holds each user once, the bots and the author do not count:
		const mentions = message.mentions.users.reduce((total, user) => (user.bot || user.id === message.author.id ? total : total + 1), 0);
		return mentions > rule.options.maximum;
	}
}
