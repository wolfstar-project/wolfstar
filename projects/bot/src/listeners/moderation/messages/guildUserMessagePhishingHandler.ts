import { ModerationMessageListener } from '#lib/moderation';
import { fetchPhishingHostnames, isListedHostname, normalizeHostname } from '#lib/moderation/automod/phishing';
import type { GuildMessage } from '#lib/types';
import { urlRegex } from '#utils/Links/UrlRegex';
import { Colors } from '#utils/constants';
import { deleteMessage } from '#utils/functions';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder, inlineCode } from '@discordjs/builders';
import { ApplyOptions } from '@wolfstar/decorators';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import type { AutoModerationRule } from 'wolfstar-database';

@ApplyOptions<ModerationMessageListener.Options<'Phishing'>>({
	emitter: 'client',
	type: 'Phishing',
	reasonLanguageKey: 'events/moderation:phishing',
	reasonLanguageKeyWithMaximum: 'events/moderation:phishingWithMaximum'
})
export class UserModerationMessageListener extends ModerationMessageListener<string, 'Phishing'> {
	// A link without a protocol is still a link a member can follow, so they are looked for too:
	private readonly kRegExp = urlRegex({ requireProtocol: false, tlds: true });

	/**
	 * @returns The hostname of the first link of the message that is in the list of known phishing links.
	 */
	protected async preProcess(message: GuildMessage, rule: AutoModerationRule<'Phishing'>): Promise<string | null> {
		if (message.content.length === 0) return null;

		// The expression is shared and keeps where it stopped, and the list is awaited: the hostnames are read first.
		const found = new Set<string>();
		for (const match of message.content.matchAll(this.kRegExp)) found.add(normalizeHostname(match.groups!.hostname));
		if (found.size === 0) return null;

		const list = await fetchPhishingHostnames();
		const { allowed } = rule.options;
		for (const hostname of found) {
			if (allowed.includes(hostname)) continue;
			if (isListedHostname(list, hostname)) return hostname;
		}

		return null;
	}

	protected onDelete(message: GuildMessage) {
		return deleteMessage(message);
	}

	protected onAlert(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return this.sendAlert(message, t, 'events/moderation:phishingFilter');
	}

	protected async onLogMessage(message: GuildMessage, t: TFunction<AnyNamespace>, hostname: string) {
		// The hostname is written as code, so the log does not make a link of it:
		return new EmbedBuilder()
			.setDescription(inlineCode(hostname))
			.setColor(Colors.Red)
			.setAuthor(getFullEmbedAuthor(message.author, message.url))
			.setFooter({ text: `#${await this.fetchChannelName(message)} | ${t('events/moderation:phishingFilterFooter')}` })
			.setTimestamp();
	}
}
