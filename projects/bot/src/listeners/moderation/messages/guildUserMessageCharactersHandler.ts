import { AutoModerationRuleListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import type { AutoModerationRule } from 'wolfstar-database';

export class UserModerationMessageListener extends AutoModerationRuleListener<'Characters'> {
	public constructor(context: AutoModerationRuleListener.LoaderContext) {
		super(context, 'Characters');
	}

	protected detect(message: GuildMessage, rule: AutoModerationRule<'Characters'>): boolean {
		return message.content.length > rule.options.maximum;
	}
}
