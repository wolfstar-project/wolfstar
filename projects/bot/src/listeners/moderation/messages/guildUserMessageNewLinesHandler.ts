import { readSettings } from '#lib/database';
import { ModerationMessageListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import { Colors } from '#utils/constants';
import { deleteMessage } from '#utils/functions';
import { getContent, getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder } from '@discordjs/builders';
import { ApplyOptions } from '@wolfstar/decorators';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';

const NEW_LINE = '\n';

@ApplyOptions<ModerationMessageListener.Options>({
	emitter: 'client',
	reasonLanguageKey: 'events/moderation:newlines',
	reasonLanguageKeyWithMaximum: 'events/moderation:newlinesWithMaximum',
	keyEnabled: 'selfmodNewlinesEnabled',
	ignoredChannelsPath: 'selfmodNewlinesIgnoredChannels',
	ignoredRolesPath: 'selfmodNewlinesIgnoredRoles',
	softPunishmentPath: 'selfmodNewlinesSoftAction',
	hardPunishmentPath: {
		action: 'selfmodNewlinesHardAction',
		actionDuration: 'selfmodNewlinesHardActionDuration',
		adder: 'newlines'
	}
})
export class UserModerationMessageListener extends ModerationMessageListener {
	protected async preProcess(message: GuildMessage): Promise<1 | null> {
		const settings = await readSettings(message.guildId);
		const threshold = settings.selfmodNewlinesMaximum;
		if (threshold === 0) return null;

		const content = getContent(message);
		if (content === null) return null;

		let count = 0;
		for (let index = -2; index !== -1; index = content.indexOf(NEW_LINE, index + 1)) count++;

		return count > threshold ? 1 : null;
	}

	protected onDelete(message: GuildMessage) {
		return deleteMessage(message);
	}

	protected onAlert(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return this.sendAlert(message, t, 'events/moderation:newlineFilter');
	}

	protected async onLogMessage(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return new EmbedBuilder()
			.setDescription(message.content)
			.setColor(Colors.Red)
			.setAuthor(getFullEmbedAuthor(message.author, message.url))
			.setFooter({ text: `#${await this.fetchChannelName(message)} | ${t('events/moderation:newlineFilterFooter')}` })
			.setTimestamp();
	}
}
