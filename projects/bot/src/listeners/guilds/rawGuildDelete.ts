import { deleteSettingsCached } from '#lib/database';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Guild } from '@wolfstar/plugin-gateway';
import type { GatewayGuildDeleteDispatchData } from 'discord-api-types/v10';

@RegisterAsGatewayListener('guildDelete')
export class UserListener extends EventGatewayListener<'guildDelete'> {
	public run(_guild: Guild | null, data: GatewayGuildDeleteDispatchData) {
		if (data.unavailable) return;

		deleteSettingsCached(data.id);
	}
}
