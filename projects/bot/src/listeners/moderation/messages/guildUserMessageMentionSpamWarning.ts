import { floatPromise, minutes } from '#common';
import { fetchGuildT } from '#lib/moderation/common';
import type { GuildMessage } from '#lib/types';
import { deleteMessage } from '#utils/functions';
import { Listener } from '@wolfstar/http-framework';

export class UserListener extends Listener {
	public async run(message: GuildMessage) {
		const t = await fetchGuildT({ id: message.guildId });

		// `sendTemporaryMessage` answers interactions on V7, a message is answered by sending one in its channel:
		const response = await this.container.gatewayClient.messages.send(message.channelId, t('events/noMentionSpam:alert'));
		floatPromise(deleteMessage(response, minutes(1)));
	}
}
