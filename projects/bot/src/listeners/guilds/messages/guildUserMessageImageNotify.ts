import { readSettings } from '#lib/database';
import type { GuildTextBasedChannel } from '#lib/moderation/managers';
import { Events, type GuildMessage } from '#lib/types';
import { getLogger } from '#utils/functions';
import { isNullish, isNullishOrEmpty, isNullishOrZero } from '@sapphire/utilities';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';

/**
 * Keeps a copy of the messages that hold an image or a video in the image logs.
 *
 * @remarks
 *
 * The original bot downloaded every image and uploaded it again. The message is forwarded instead (a message
 * reference), which keeps its attachments after the message is deleted without downloading anything.
 */
@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.GuildUserMessage })
export class UserListener extends Listener {
	public async run(message: GuildMessage) {
		// If there are no attachments, do not post:
		if (message.attachments.size === 0) return;

		// If the message was edited, do not repost:
		if (message.editedTimestamp) return;

		const settings = await readSettings(message.guildId);
		const logChannelId = settings.logsImage;
		if (isNullish(logChannelId) || settings.logsIgnoreAll.includes(message.channelId)) return;

		// A forward takes the whole message, so one image or video is enough:
		if (!this.hasMedia(message)) return;

		const logger = await getLogger(message.guildId);
		await logger.send({
			key: 'logsImage',
			channelId: logChannelId,
			// A message cannot be forwarded to the channel it is in:
			condition: () => logChannelId !== message.channelId,
			makeMessage: (_channel: GuildTextBasedChannel) => ({ forward: { message } })
		});
	}

	private hasMedia(message: GuildMessage) {
		for (const attachment of message.attachments.values()) {
			// Skip if the attachment doesn't have a content type:
			if (isNullishOrEmpty(attachment.contentType)) continue;
			// Skip if the attachment doesn't have a size:
			if (isNullishOrZero(attachment.width) || isNullishOrZero(attachment.height)) continue;

			const [kind] = attachment.contentType.split('/', 1);
			if (kind === 'image' || kind === 'video') return true;
		}

		return false;
	}
}
