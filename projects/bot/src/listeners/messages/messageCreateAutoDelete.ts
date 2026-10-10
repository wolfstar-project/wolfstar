import { resolveOnErrorCodes } from '#common';
import { shouldAutoDelete } from '#lib/moderation/cleanup/filters';
import { readAutoDeletes } from '#lib/moderation/cleanup/store';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Message } from '@wolfstar/plugin-gateway';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';

/**
 * Deletes the messages sent in the channels that have their messages deleted, see `/autodelete` and
 * `lib/moderation/cleanup`.
 *
 * @remarks
 *
 * It listens to every message and not to `GuildUserMessage`, which leaves the bots out: a channel can have their
 * messages deleted too. The messages of the bot itself are never deleted, nor the ones of the system (joins, pins,
 * boosts). A message that is deleted after a delay is a job of the `autoDeleteMessage` task, so it survives a restart.
 */
@RegisterAsGatewayListener('messageCreate')
export class UserListener extends EventGatewayListener<'messageCreate'> {
	public async run(message: Message) {
		const { guildId } = message;
		if (guildId === null || message.system) return;
		if (message.author.id === this.container.gatewayClient.user?.id) return;

		const configs = await readAutoDeletes(guildId);
		const config = configs.find((entry) => entry.channelId === message.channelId);
		if (config === undefined) return;

		const subject = {
			content: message.content,
			// A webhook is not a member either, so it goes with the bots:
			author: { id: message.author.id, bot: message.author.bot || message.webhookId !== null },
			attachments: message.attachments,
			embeds: message.embeds
		};
		if (!shouldAutoDelete(subject, config)) return;

		if (config.delay > 0) {
			await this.container.tasks.create(
				{ name: 'autoDeleteMessage', payload: { channelId: message.channelId, messageId: message.id } },
				{ repeated: false, delay: config.delay, customJobOptions: { removeOnComplete: true, removeOnFail: true } }
			);
			return;
		}

		await resolveOnErrorCodes(
			this.container.gatewayClient.messages.delete(message.channelId, message.id, 'Auto delete'),
			RESTJSONErrorCodes.UnknownMessage,
			RESTJSONErrorCodes.MissingAccess,
			RESTJSONErrorCodes.MissingPermissions
		);
	}
}
