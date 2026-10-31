import { sendSimpleLog } from '#lib/moderation/logs/simple';
import { Colors } from '#utils/constants';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { Integration } from '@wolfstar/plugin-gateway';
import type { GatewayIntegrationDeleteDispatchData } from 'discord-api-types/v10';

@RegisterAsDispatchListener('integrationDelete')
export class UserListener extends EventGatewayListener<'integrationDelete'> {
	public async run(integration: Integration | null, data: GatewayIntegrationDeleteDispatchData) {
		await sendSimpleLog(data.guild_id, 'logsIntegrations', (t) => ({
			color: Colors.Red,
			author: integration === null ? data.id : `${integration.name} (${data.id})`,
			lines: [],
			footer: t('events/guilds-logs:integrationDelete')
		}));
	}
}
