import { addAutoModerationRuleHits } from '#lib/moderation/automod/rules';
import { AutoModerationRuleListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import { isNullishOrZero } from '@sapphire/utilities';
import type { AutoModerationRule } from 'wolfstar-database';

/**
 * How much a mention counts for a rule that weighs them, a user mention counting as one.
 */
const MentionWeights = { role: 2, everyone: 5 } as const;

export class UserModerationMessageListener extends AutoModerationRuleListener<'MentionsCooldown'> {
	public constructor(context: AutoModerationRuleListener.LoaderContext) {
		super(context, 'MentionsCooldown');
	}

	protected detect(message: GuildMessage, rule: AutoModerationRule<'MentionsCooldown'>): boolean {
		if (!isNullishOrZero(message.editedTimestamp)) return false;

		const users = message.mentions.users.reduce((total, user) => (user.bot || user.id === message.author.id ? total : total + 1), 0);
		const weights = rule.options.weighted ? MentionWeights : { role: 1, everyone: 1 };
		const mentions = users + message.mentions.roleIds.length * weights.role + Number(message.mentions.everyone) * weights.everyone;
		return addAutoModerationRuleHits(rule, message.author.id, mentions);
	}
}
