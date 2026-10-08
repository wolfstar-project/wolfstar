import { hasSpoiler, isSpoilerAttachment } from '#lib/moderation/automod/detectors';
import { AutoModerationRuleListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';

export class UserModerationMessageListener extends AutoModerationRuleListener<'Spoilers'> {
	public constructor(context: AutoModerationRuleListener.LoaderContext) {
		super(context, 'Spoilers');
	}

	protected detect(message: GuildMessage): boolean {
		return hasSpoiler(message.content) || message.attachments.some((attachment) => isSpoilerAttachment(attachment.name));
	}
}
