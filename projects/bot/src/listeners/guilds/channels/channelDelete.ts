import { readSettings, writeSettings } from '#lib/database';
import { readCommandRestrictions, removeFromCommandRestrictions } from '#lib/structures/commands-menu/restrictions';
import { isGuildBasedChannel } from '@wolfstar/http-framework-utilities/gateway';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { AnyChannel, GuildBasedChannel } from '@wolfstar/plugin-gateway';

/**
 * Takes a channel that was deleted out of what the server restricted its commands to: a command that was only allowed
 * in that channel would otherwise run nowhere.
 */
@RegisterAsGatewayListener('channelDelete')
export class UserListener extends EventGatewayListener<'channelDelete'> {
	public async run(deleted: AnyChannel) {
		if (!isGuildBasedChannel(deleted)) return;

		const channel = deleted as GuildBasedChannel;

		// Most channels are in no restriction, and the settings are only written for the ones that are:
		const settings = await readSettings(channel.guildId);
		if (removeFromCommandRestrictions(readCommandRestrictions(settings.commandsRestrictions), channel.id) === null) return;

		await writeSettings(
			channel.guildId,
			(current) => {
				const restrictions = removeFromCommandRestrictions(readCommandRestrictions(current.commandsRestrictions), channel.id);
				return restrictions === null ? {} : { commandsRestrictions: restrictions as never };
			},
			this.container.gatewayClient.user!.id
		);
	}
}
