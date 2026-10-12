import { getMessageSpamCounterKey } from '#lib/moderation/automod/detectors';
import { addAutoModerationRuleHits } from '#lib/moderation/automod/rules';
import { AutoModerationRuleListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import { isNullishOrZero } from '@sapphire/utilities';
import type { AutoModerationRule } from 'wolfstar-database';

export class UserModerationMessageListener extends AutoModerationRuleListener<'MessageSpam'> {
	public constructor(context: AutoModerationRuleListener.LoaderContext) {
		super(context, 'MessageSpam');
	}

	protected detect(message: GuildMessage, rule: AutoModerationRule<'MessageSpam'>): boolean {
		// An edit is not a new message:
		if (!isNullishOrZero(message.editedTimestamp)) return false;
		const key = getMessageSpamCounterKey(rule.options.perChannel, message.channelId, message.author.id);
		return addAutoModerationRuleHits(rule, key, 1);
	}
}
