import { AutoModerationRuleListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';

/**
 * Applies the `Polls` rules: every message with a native poll of Discord infringes them, the polls that are posted to
 * spam or to advertise.
 */
export class UserModerationMessageListener extends AutoModerationRuleListener<'Polls'> {
	public constructor(context: AutoModerationRuleListener.LoaderContext) {
		super(context, 'Polls');
	}

	protected detect(message: GuildMessage): boolean {
		return message.poll !== null && message.poll !== undefined;
	}
}
