import { countRepeats } from '#lib/moderation/automod/detectors';
import { AutoModerationRuleListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import type { AutoModerationRule } from 'wolfstar-database';

export class UserModerationMessageListener extends AutoModerationRuleListener<'Duplicates'> {
	public constructor(context: AutoModerationRuleListener.LoaderContext) {
		super(context, 'Duplicates');
	}

	protected detect(message: GuildMessage, rule: AutoModerationRule<'Duplicates'>): boolean {
		const repeats = countRepeats(message.content);
		return repeats.characters > rule.options.characters || repeats.words > rule.options.words;
	}
}
