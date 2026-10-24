import { addAutoModerationRuleHits } from '#lib/moderation/automod/rules';
import { AutoModerationRuleListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import { isNullishOrZero } from '@sapphire/utilities';
import type { AutoModerationRule } from 'wolfstar-database';

export class UserModerationMessageListener extends AutoModerationRuleListener<'MentionsCooldown'> {
	public constructor(context: AutoModerationRuleListener.LoaderContext) {
		super(context, 'MentionsCooldown');
	}

	protected detect(message: GuildMessage, rule: AutoModerationRule<'MentionsCooldown'>): boolean {
		if (!isNullishOrZero(message.editedTimestamp)) return false;

		const users = message.mentions.users.reduce((total, user) => (user.bot || user.id === message.author.id ? total : total + 1), 0);
		const mentions = users + message.mentions.roleIds.length + Number(message.mentions.everyone);
		return addAutoModerationRuleHits(rule, message.author.id, mentions);
	}
}
