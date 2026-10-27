import { readSettings, writeSettings } from '#lib/database';
import { announceJoinGuardChange, writeJoinGuardRules } from '#lib/moderation/joinguard/store';
import { readCommandRestrictions, removeFromCommandRestrictions } from '#lib/structures/commands-menu/restrictions';
import { isGuildBasedChannel } from '@wolfstar/http-framework-utilities/gateway';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { AnyChannel, GuildBasedChannel } from '@wolfstar/plugin-gateway';
import { clearJoinGuardRuleAlertChannel } from 'wolfstar-database';

/**
 * Takes a channel that was deleted out of what the server restricted its commands to: a command that was only allowed
 * in that channel would otherwise run nowhere.
 */
@RegisterAsDispatchListener('channelDelete')
export class UserListener extends EventGatewayListener<'channelDelete'> {
	public async run(deleted: AnyChannel) {
		if (!isGuildBasedChannel(deleted)) return;

		const channel = deleted as GuildBasedChannel;

		await this.#forgetJoinGuardChannel(channel);

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

	/**
	 * The checkpoint of the join guard, and the rules that alert in the channel, forget it: a new button is posted in the
	 * next channel, and an alert has nowhere to go.
	 */
	async #forgetJoinGuardChannel(channel: GuildBasedChannel) {
		const { guildId, id } = channel;
		await writeJoinGuardRules(guildId, async (rules) => {
			if (rules.some((rule) => rule.alertChannelId === id)) await clearJoinGuardRuleAlertChannel(this.container.prisma, guildId, id);
		});

		const settings = await readSettings(guildId);
		if (settings.joinGuardCheckpointChannel !== id) return;

		await writeSettings(guildId, { joinGuardCheckpointChannel: null, joinGuardCheckpointMessage: null }, this.container.gatewayClient.user!.id);
		announceJoinGuardChange(guildId);
	}
}
