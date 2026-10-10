import { addAutoModerationRuleHits } from '#lib/moderation/automod/rules';
import { AutoModerationRuleListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import { isNullishOrZero } from '@sapphire/utilities';
import type { AutoModerationRule } from 'wolfstar-database';

export class UserModerationMessageListener extends AutoModerationRuleListener<'StickersCooldown'> {
	public constructor(context: AutoModerationRuleListener.LoaderContext) {
		super(context, 'StickersCooldown');
	}

	protected detect(message: GuildMessage, rule: AutoModerationRule<'StickersCooldown'>): boolean {
		if (!isNullishOrZero(message.editedTimestamp)) return false;
		return addAutoModerationRuleHits(rule, message.author.id, message.stickers.size);
	}
}
