import { ModerationMessageListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import { Colors } from '#utils/constants';
import { deleteMessage } from '#utils/functions';
import { getContent, getFullEmbedAuthor } from '#utils/util';
import { isZalgo } from '#utils/zalgo';
import { EmbedBuilder } from '@discordjs/builders';
import { ApplyOptions } from '@wolfstar/decorators';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import type { AutoModerationRule } from 'wolfstar-database';

@ApplyOptions<ModerationMessageListener.Options<'Zalgo'>>({
	emitter: 'client',
	type: 'Zalgo',
	reasonLanguageKey: 'events/moderation:zalgo',
	reasonLanguageKeyWithMaximum: 'events/moderation:zalgoWithMaximum'
})
export class UserModerationMessageListener extends ModerationMessageListener<1, 'Zalgo'> {
	protected preProcess(message: GuildMessage, rule: AutoModerationRule<'Zalgo'>): 1 | null {
		const content = getContent(message);
		if (content === null) return null;

		return isZalgo(content, rule.options.maximum) ? 1 : null;
	}

	protected onDelete(message: GuildMessage) {
		return deleteMessage(message);
	}

	protected onAlert(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return this.sendAlert(message, t, 'events/moderation:zalgoFilter');
	}

	protected async onLogMessage(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return new EmbedBuilder()
			.setDescription(message.content)
			.setColor(Colors.Red)
			.setAuthor(getFullEmbedAuthor(message.author, message.url))
			.setFooter({ text: `#${await this.fetchChannelName(message)} | ${t('events/moderation:zalgoFilterFooter')}` })
			.setTimestamp();
	}
}
