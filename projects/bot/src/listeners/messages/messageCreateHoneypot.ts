import { isGuildMessage } from '#common';
import { readSettings } from '#lib/database';
import { catchHoneypotMessage } from '#lib/moderation/honeypot/catch';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Message } from '@wolfstar/plugin-gateway';

/**
 * Catches who writes in the honeypot channel of a guild, see `/honeypot` and `lib/moderation/honeypot`.
 *
 * @remarks
 *
 * The honeypot is for the accounts of users that post spam, so the bots, the webhooks and the messages of the system
 * are not what it looks for: a bot that announces in the channel is one the server added.
 */
@RegisterAsGatewayListener('messageCreate')
export class UserListener extends EventGatewayListener<'messageCreate'> {
	public async run(message: Message) {
		const { guildId } = message;
		if (guildId === null || message.system || message.webhookId !== null || message.author.bot) return;

		const settings = await readSettings(guildId);
		if (settings.honeypotChannel !== message.channelId || !isGuildMessage(message)) return;

		await catchHoneypotMessage(message, settings);
	}
}
