import { readSettingsCached, readSettingsPermissionNodes, writeSettings } from '#lib/database';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Role } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('guildRoleUpdate')
export class UserListener extends EventGatewayListener<'guildRoleUpdate'> {
	public async run(previous: Role | null, next: Role) {
		// The role was not cached, whether or not its position changed is unknown:
		if (previous === null) return;
		if (previous.position === next.position) return;

		const guild = await this.container.gatewayClient.guilds.resolve(next.guildId);
		if (!guild?.available) return;

		const settings = readSettingsCached(next);
		if (!settings) return;

		const nodes = readSettingsPermissionNodes(settings);
		if (!nodes.has(next.id)) return;

		await writeSettings(next, { permissionsRoles: await nodes.refresh(settings) }, this.container.gatewayClient.user!.id);
	}
}
