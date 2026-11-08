import { readSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import { Colors } from '#utils/constants';
import { getLogger } from '#utils/functions';
import { EmbedBuilder } from '@discordjs/builders';
import { EventGatewayListener, RegisterAsDispatchListener, type AutoModerationActionExecution } from '@wolfstar/plugin-gateway';
import { AutoModerationActionType } from 'discord-api-types/v10';

/** Reports the actions Discord's own rules take, independently of the bot's rules. */
@RegisterAsDispatchListener('autoModerationActionExecution')
export class UserListener extends EventGatewayListener<'autoModerationActionExecution'> {
	public override async run(execution: AutoModerationActionExecution) {
		const settings = await readSettings(execution.guildId);
		if (!settings.modulesAutomod || !settings.automodTrackNative || !settings.automodChannel) return;

		const guild = await this.container.gatewayClient.guilds.resolve(execution.guildId);
		if (!guild) return;
		const t = await fetchGuildT(guild);
		const action =
			execution.action.type === AutoModerationActionType.BlockMessage
				? t('events/moderation:nativeAutoModBlocked')
				: execution.action.type === AutoModerationActionType.SendAlertMessage
					? t('events/moderation:nativeAutoModAlert')
					: execution.action.type === AutoModerationActionType.Timeout
						? t('events/moderation:nativeAutoModTimeout')
						: t('events/moderation:nativeAutoModOther', { type: execution.action.type });
		const logger = await getLogger(guild);
		await logger.send({
			key: 'automodChannel',
			channelId: settings.automodChannel,
			makeMessage: () => {
				const embed = new EmbedBuilder()
					.setColor(Colors.Red)
					.setTitle(t('events/moderation:nativeAutoModTitle'))
					.setDescription(
						t('events/moderation:nativeAutoModDescription', {
							user: `<@${execution.userId}>`,
							channel: execution.channelId ? `<#${execution.channelId}>` : '—',
							rule: execution.ruleId,
							action
						})
					)
					.setTimestamp();
				if (execution.content)
					embed.addFields({ name: t('events/moderation:nativeAutoModContent'), value: execution.content.slice(0, 1024) });
				return embed;
			}
		});
	}
}
