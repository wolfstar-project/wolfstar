import { readSettings, readSettingsNoMentionSpam } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import { Events, type GuildMessage } from '#lib/types';
import { getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { getTag } from '#utils/util';
import { Listener } from '@wolfstar/http-framework';

export class UserListener extends Listener {
	public async run(message: GuildMessage) {
		const settings = await readSettings(message.guildId);
		const moderation = await getModeration(message.guildId);
		const lock = moderation.createLock();
		try {
			const t = await fetchGuildT({ id: message.guildId });
			const { members, messages } = this.container.gatewayClient;
			await members
				.ban(message.guildId, message.author.id, { deleteMessageSeconds: 0, reason: t('events/noMentionSpam:footer') })
				.catch((error) => this.container.client.emit(Events.Error, error));
			await messages
				.send(message.channelId, t('events/noMentionSpam:message', { userId: message.author.id, userTag: getTag(message.author) }))
				.catch((error) => this.container.client.emit(Events.Error, error));

			const ctx = readSettingsNoMentionSpam(settings);
			ctx.delete(message.author.id);

			const threshold = settings.automodNoMentionSpamMentionsAllowed;
			const reason = t('events/noMentionSpam:modlog', { threshold });
			await moderation.insert(moderation.create({ user: message.author.id, type: TypeVariation.Ban, reason }));
		} finally {
			lock();
		}
	}
}
