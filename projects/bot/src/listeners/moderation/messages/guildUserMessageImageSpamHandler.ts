import { addAutoModerationRuleHits } from '#lib/moderation/automod/rules';
import { getImageUrl } from '#utils/util';
import { AutoModerationRuleListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import { isNullishOrZero } from '@sapphire/utilities';
import type { AutoModerationRule } from 'wolfstar-database';

export class UserModerationMessageListener extends AutoModerationRuleListener<'ImageSpam'> {
	public constructor(context: AutoModerationRuleListener.LoaderContext) {
		super(context, 'ImageSpam');
	}

	protected detect(message: GuildMessage, rule: AutoModerationRule<'ImageSpam'>): boolean {
		if (!isNullishOrZero(message.editedTimestamp)) return false;

		const images = message.attachments.reduce((total, attachment) => (getImageUrl(attachment.url) === undefined ? total : total + 1), 0);
		return addAutoModerationRuleHits(rule, message.author.id, images);
	}
}
