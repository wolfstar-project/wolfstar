import { readSettingsEmojiSpam } from '#lib/database';
import { Events, type GuildMessage } from '#lib/types';
import { isModerator } from '#utils/functions';
import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { isNullishOrZero } from '@sapphire/utilities';
import { EMOJI_REGEX } from '@sapphire/discord-utilities';

@ApplyOptions<Listener.Options>({ event: Events.GuildUserMessage })
export class UserListener extends Listener {
	public async run(message: GuildMessage) {
		if (!isNullishOrZero(message.editedTimestamp)) return;
		if (await isModerator(message.member)) return;

		const settings = await readSettingsEmojiSpam(message.guild);
		if (!settings.emojiSpamEnabled) return;
		if (settings.selfmodIgnoredChannels.includes(message.channel.id)) return;

		const emojis = (message.content.match(EMOJI_REGEX) || []).length;
		if (emojis === 0) return;

		const ctx = readSettingsEmojiSpam(settings);
		const rateLimit = ctx.acquire(message.author.id);

		try {
			for (let i = 0; i < emojis; i++) rateLimit.consume();
			rateLimit.resetTime();
			if (settings.emojiSpamAlerts && rateLimit.remaining / rateLimit.limit <= 0.2) {
				message.client.emit(Events.EmojiSpamWarning, message);
			}
		} catch (err) {
			message.client.emit(Events.EmojiSpamExceeded, message);
		}
	}
}
