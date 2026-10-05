import { readSettings } from '#lib/database';
import { ModerationMessageListener } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import { urlRegex } from '#utils/Links/UrlRegex';
import { Colors } from '#utils/constants';
import { deleteMessage } from '#utils/functions';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder } from '@discordjs/builders';
import { ApplyOptions } from '@wolfstar/decorators';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';

@ApplyOptions<ModerationMessageListener.Options>({
	emitter: 'client',
	reasonLanguageKey: 'events/moderation:links',
	reasonLanguageKeyWithMaximum: 'events/moderation:linksWithMaximum',
	keyEnabled: 'selfmodLinksEnabled',
	ignoredChannelsPath: 'selfmodLinksIgnoredChannels',
	ignoredRolesPath: 'selfmodLinksIgnoredRoles',
	softPunishmentPath: 'selfmodLinksSoftAction',
	hardPunishmentPath: {
		action: 'selfmodLinksHardAction',
		actionDuration: 'selfmodLinksHardActionDuration',
		adder: 'links'
	}
})
export class UserModerationMessageListener extends ModerationMessageListener {
	private readonly kRegExp = urlRegex({ requireProtocol: true, tlds: true });
	private readonly kAllowedDomains = /^(?:\w+\.)?(?:discordapp.com|discord.gg|discord.com)$/i;

	protected async preProcess(message: GuildMessage): Promise<1 | null> {
		if (message.content.length === 0) return null;

		let match: RegExpExecArray | null = null;

		const settings = await readSettings(message.guildId);
		const allowed = settings.selfmodLinksAllowed;
		while ((match = this.kRegExp.exec(message.content)) !== null) {
			const { hostname } = match.groups!;
			if (this.kAllowedDomains.test(hostname)) continue;
			if (allowed.includes(hostname)) continue;
			return 1;
		}

		return null;
	}

	protected onDelete(message: GuildMessage) {
		return deleteMessage(message);
	}

	protected onAlert(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return this.sendAlert(message, t, 'events/moderation:nolink');
	}

	protected async onLogMessage(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return new EmbedBuilder()
			.setColor(Colors.Red)
			.setAuthor(getFullEmbedAuthor(message.author, message.url))
			.setFooter({ text: `#${await this.fetchChannelName(message)} | ${t('events/moderation:link')}` })
			.setTimestamp();
	}
}
