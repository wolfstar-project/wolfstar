import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { channelMention } from '@discordjs/formatters';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GatewayWebhooksUpdateDispatchData } from 'discord-api-types/v10';

/**
 * Logs that the webhooks of a channel changed. Discord only says which channel, not which webhook nor what changed, so
 * the log says the channel and nothing more. The webhooks the bot makes for its own logs (`logs.webhooks`) are changes
 * too, and are logged as the others.
 */
@RegisterAsGatewayListener('webhooksUpdate')
export class UserListener extends EventGatewayListener<'webhooksUpdate'> {
	public async run(data: GatewayWebhooksUpdateDispatchData) {
		await sendSimpleLog(data.guild_id, 'logsIntegrations', (t) => ({
			color: Colors.Yellow,
			author: data.channel_id,
			lines: [t('events/guilds-logs:fieldChannel', { value: channelMention(data.channel_id) })],
			footer: t('events/guilds-logs:webhooksUpdate')
		}));
	}
}
