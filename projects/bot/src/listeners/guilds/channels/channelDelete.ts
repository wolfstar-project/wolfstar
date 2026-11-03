import { readSettings, writeSettings } from '#lib/database';
import { readAutoModerationRules, updateAutoModerationRule } from '#lib/moderation/automod/rules';
import { announceJoinGuardChange } from '#lib/moderation/joinguard/store';
import { getLogPrefix } from '#utils/functions';
import { readCommandRestrictions, removeFromCommandRestrictions, writeCommandRestrictions } from '#lib/structures/commands-menu/restrictions';
import { isGuildBasedChannel } from '@wolfstar/http-framework-utilities/gateway';
import { EventGatewayListener, RegisterAsDispatchListener } from '@wolfstar/plugin-gateway';
import type { AnyChannel, GuildBasedChannel } from '@wolfstar/plugin-gateway';
import { clearJoinGuardRuleAlertChannel, type AutoModerationRule } from 'wolfstar-database';

/**
 * Takes a channel that was deleted out of what the server restricted its commands to (a command that was only allowed
 * in that channel would otherwise run nowhere), out of the join guard and out of the auto-moderation rules.
 */
@RegisterAsDispatchListener('channelDelete')
export class UserListener extends EventGatewayListener<'channelDelete'> {
	public async run(deleted: AnyChannel) {
		if (!isGuildBasedChannel(deleted)) return;

		const channel = deleted as GuildBasedChannel;
		await this.#forgetCommandRestrictions(channel);
		await this.#forgetJoinGuardChannel(channel);
		await this.#forgetAutoModerationChannel(channel);
	}

	/**
	 * The rules that log in the channel, or that exempted it, forget it: a log would be lost, and an exemption of a
	 * channel that is gone is noise.
	 */
	async #forgetAutoModerationChannel(channel: GuildBasedChannel) {
		const { guildId, id } = channel;
		let rules: readonly AutoModerationRule[];
		try {
			rules = await readAutoModerationRules(guildId);
		} catch (error) {
			this.container.logger.error(`${getLogPrefix(this)} Could not read the auto-moderation rules of ${guildId}:`, error);
			return;
		}

		// A rule that fails (deleted meanwhile, a database error) does not keep the others pointing at the channel:
		for (const rule of rules) {
			if (rule.logChannelId !== id && !rule.ignoredChannels.includes(id)) continue;
			try {
				await updateAutoModerationRule(guildId, rule.id, (current) => ({
					...(current.logChannelId === id ? { logChannelId: null } : {}),
					...(current.ignoredChannels.includes(id)
						? { ignoredChannels: current.ignoredChannels.filter((channelId) => channelId !== id) }
						: {})
				}));
			} catch (error) {
				this.container.logger.error(
					`${getLogPrefix(this)} Could not remove the deleted channel ${id} from the rule ${rule.id} of ${guildId}:`,
					error
				);
			}
		}
	}

	async #forgetCommandRestrictions(channel: GuildBasedChannel) {
		// Most channels are in no restriction, and the settings are only written for the ones that are:
		const settings = await readSettings(channel.guildId);
		if (removeFromCommandRestrictions(readCommandRestrictions(settings.commandsRestrictions, channel.guildId), channel.id) === null) return;

		await writeSettings(
			channel.guildId,
			(current) => {
				const restrictions = removeFromCommandRestrictions(
					readCommandRestrictions(current.commandsRestrictions, channel.guildId),
					channel.id
				);
				return restrictions === null ? {} : { commandsRestrictions: writeCommandRestrictions(restrictions) as never };
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
		try {
			// One update, which most guilds match no row of; the other processes are only told when a rule changed:
			let changed = (await clearJoinGuardRuleAlertChannel(this.container.prisma, guildId, id)) > 0;

			const settings = await readSettings(guildId);
			if (settings.joinGuardCheckpointChannel === id) {
				await writeSettings(
					guildId,
					{ joinGuardCheckpointChannel: null, joinGuardCheckpointMessage: null },
					this.container.gatewayClient.user!.id
				);
				changed = true;
			}

			if (changed) announceJoinGuardChange(guildId);
		} catch (error) {
			this.container.logger.error(`${getLogPrefix(this)} Could not remove the deleted channel ${id} from the join guard of ${guildId}:`, error);
		}
	}
}
