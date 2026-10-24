import { countEmojis } from '#lib/moderation/automod/detectors';
import { AutoModerationRuleListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import type { AutoModerationRule } from 'wolfstar-database';

export class UserModerationMessageListener extends AutoModerationRuleListener<'Emojis'> {
	public constructor(context: AutoModerationRuleListener.LoaderContext) {
		super(context, 'Emojis');
	}

	protected detect(message: GuildMessage, rule: AutoModerationRule<'Emojis'>): boolean {
		return countEmojis(message.content) > rule.options.maximum;
	}
}
