import { ModerationData, ModerationTask } from '#lib/moderation';
import { getSecurity } from '#utils/functions';
import { fetchT } from '@sapphire/plugin-i18next';
import type { Guild } from 'discord.js';

export class UserModerationTask extends ModerationTask {
	protected async handle(guild: Guild, data: ModerationData) {
		const t = await fetchT(guild);
		await getSecurity(guild).actions.unMute(
			{
				moderatorId: process.env.CLIENT_ID,
				userId: data.userID,
				reason: `[MODERATION] Mute released after ${t('globals:durationValue', { value: data.duration })}`
			},
			await this.getTargetDM(guild, await this.container.gatewayClient.users.fetch(data.userID))
		);
		return null;
	}
}
