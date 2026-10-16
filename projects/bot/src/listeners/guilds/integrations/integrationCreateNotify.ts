import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { userMention } from '@discordjs/formatters';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Integration } from '@wolfstar/plugin-gateway';

/**
 * Logs an app or an integration that is added to the server, and who added it.
 */
@RegisterAsGatewayListener('integrationCreate')
export class UserListener extends EventGatewayListener<'integrationCreate'> {
	public async run(integration: Integration) {
		await sendSimpleLog(integration.guildId, 'logsIntegrations', (t) => ({
			color: Colors.Green,
			author: `${integration.name} (${integration.id})`,
			lines: [
				t('events/guilds-logs:fieldType', { value: integration.type }),
				integration.user === null ? null : t('events/guilds-logs:fieldCreator', { value: userMention(integration.user.id) })
			],
			footer: t('events/guilds-logs:integrationCreate')
		}));
	}
}
