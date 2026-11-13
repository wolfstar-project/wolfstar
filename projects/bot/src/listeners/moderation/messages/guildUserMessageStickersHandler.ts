import { ModerationMessageListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import { Colors } from '#utils/constants';
import { deleteMessage } from '#utils/functions';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder, inlineCode } from '@discordjs/builders';
import { ApplyOptions } from '@wolfstar/decorators';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';

@ApplyOptions<ModerationMessageListener.Options<'Stickers'>>({
	emitter: 'client',
	type: 'Stickers',
	reasonLanguageKey: 'events/moderation:stickers',
	reasonLanguageKeyWithMaximum: 'events/moderation:stickersWithMaximum'
})
export class UserModerationMessageListener extends ModerationMessageListener<string[], 'Stickers'> {
	/**
	 * @returns The names of the stickers of the message.
	 */
	protected preProcess(message: GuildMessage): string[] | null {
		const names = message.stickers.map((sticker) => sticker.name);
		return names.length > 0 ? names : null;
	}

	protected onDelete(message: GuildMessage) {
		return deleteMessage(message);
	}

	protected onAlert(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return this.sendAlert(message, t, 'events/moderation:stickerFilter');
	}

	protected async onLogMessage(message: GuildMessage, t: TFunction<AnyNamespace>, names: string[]) {
		// A message that only holds a sticker has no content, the log names the stickers:
		const stickers = names.map((name) => inlineCode(name)).join(', ');
		return new EmbedBuilder()
			.setDescription(message.content ? `${message.content}\n\n${stickers}` : stickers)
			.setColor(Colors.Red)
			.setAuthor(getFullEmbedAuthor(message.author, message.url))
			.setFooter({ text: `#${await this.fetchChannelName(message)} | ${t('events/moderation:stickerFilterFooter')}` })
			.setTimestamp();
	}
}
