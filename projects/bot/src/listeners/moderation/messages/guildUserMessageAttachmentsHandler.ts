import { ModerationMessageListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import { Colors } from '#utils/constants';
import { deleteMessage } from '#utils/functions';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder } from '@discordjs/builders';
import { ApplyOptions } from '@wolfstar/decorators';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';

@ApplyOptions<ModerationMessageListener.Options>({
	emitter: 'client',
	reasonLanguageKey: 'events/moderation:attachments',
	reasonLanguageKeyWithMaximum: 'events/moderation:attachmentsWithMaximum',
	keyEnabled: 'selfmodAttachmentsEnabled',
	ignoredChannelsPath: 'selfmodAttachmentsIgnoredChannels',
	ignoredRolesPath: 'selfmodAttachmentsIgnoredRoles',
	softPunishmentPath: 'selfmodAttachmentsSoftAction',
	hardPunishmentPath: {
		action: 'selfmodAttachmentsHardAction',
		actionDuration: 'selfmodAttachmentsHardActionDuration',
		adder: 'attachments'
	}
})
export class UserModerationMessageListener extends ModerationMessageListener {
	protected preProcess(message: GuildMessage): 1 | null {
		const attachments = message.attachments.size;
		return attachments > 0 ? 1 : null;
	}

	protected onDelete(message: GuildMessage) {
		return deleteMessage(message);
	}

	protected onAlert(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return this.sendAlert(message, t, 'events/moderation:attachmentFilter');
	}

	protected async onLogMessage(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return (
			new EmbedBuilder()
				// A message that only holds attachments has no content, and an embed takes no empty description:
				.setDescription(message.content || null)
				.setColor(Colors.Red)
				.setAuthor(getFullEmbedAuthor(message.author, message.url))
				.setFooter({ text: `#${await this.fetchChannelName(message)} | ${t('events/moderation:attachmentFilterFooter')}` })
				.setTimestamp()
		);
	}
}
