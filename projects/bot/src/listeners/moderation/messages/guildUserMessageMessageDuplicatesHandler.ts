import { pushAutoModerationRuleMessage } from '#lib/moderation/automod/rules';
import { AutoModerationRuleListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import { getContent } from '#utils/util';
import type { AutoModerationRule } from 'wolfstar-database';

export class UserModerationMessageListener extends AutoModerationRuleListener<'MessageDuplicates'> {
	public constructor(context: AutoModerationRuleListener.LoaderContext) {
		super(context, 'MessageDuplicates');
	}

	protected detect(message: GuildMessage, rule: AutoModerationRule<'MessageDuplicates'>): boolean {
		const content = getContent(message);
		if (content === null) return false;

		return pushAutoModerationRuleMessage(rule, message.channelId, content) >= rule.options.maximum;
	}
}
