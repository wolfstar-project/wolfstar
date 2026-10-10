import { hasMaskedLink } from '#lib/moderation/automod/detectors';
import { AutoModerationRuleListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';

export class UserModerationMessageListener extends AutoModerationRuleListener<'MaskedLinks'> {
	public constructor(context: AutoModerationRuleListener.LoaderContext) {
		super(context, 'MaskedLinks');
	}

	protected detect(message: GuildMessage): boolean {
		return hasMaskedLink(message.content);
	}
}
