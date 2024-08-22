import { readSettingsEmojiSpam } from '#lib/database';
import { getT } from '#lib/i18n';
import { LanguageKeys } from '#lib/i18n/languageKeys';
import { Events, type GuildMessage } from '#lib/types';
import { getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { getTag } from '#utils/util';
import { Listener } from '@sapphire/framework';

export class UserListener extends Listener {
	public async run(message: GuildMessage) {
		const settings = await readSettingsEmojiSpam(message.guild);
		const moderation = getModeration(message.guild);
		const lock = moderation.createLock();
		try {
			const t = getT(settings.language);
			await message.guild.members
				.ban(message.author.id, { deleteMessageSeconds: 0, reason: t(LanguageKeys.Events.EmojiSpam.Footer) })
				.catch((error) => this.container.client.emit(Events.Error, error));
			await message.channel
				.send(t(LanguageKeys.Events.EmojiSpam.Message, { userId: message.author.id, userTag: getTag(message.author) }))
				.catch((error) => this.container.client.emit(Events.Error, error));

			const ctx = readSettingsEmojiSpam(settings);
			ctx.delete(message.author.id);

			const threshold = settings.emojiSpamEmojisAllowed;
			const reason = t(LanguageKeys.Events.EmojiSpam.ModerationLog, { threshold });
			await moderation.insert(moderation.create({ user: message.author.id, type: TypeVariation.Ban, reason }));
		} finally {
			lock();
		}
	}
}
