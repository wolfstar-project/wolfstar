import { countLinks } from '#lib/moderation/automod/detectors';
import { addAutoModerationRuleHits } from '#lib/moderation/automod/rules';
import { AutoModerationRuleListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import { isNullishOrZero } from '@sapphire/utilities';
import type { AutoModerationRule } from 'wolfstar-database';

export class UserModerationMessageListener extends AutoModerationRuleListener<'LinksCooldown'> {
	public constructor(context: AutoModerationRuleListener.LoaderContext) {
		super(context, 'LinksCooldown');
	}

	protected detect(message: GuildMessage, rule: AutoModerationRule<'LinksCooldown'>): boolean {
		if (!isNullishOrZero(message.editedTimestamp)) return false;
		return addAutoModerationRuleHits(rule, message.author.id, countLinks(message.content));
	}
}
