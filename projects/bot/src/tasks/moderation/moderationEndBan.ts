import { ModerationData, ModerationTask } from '#lib/moderation';
import { getSecurity } from '#utils/functions';
import { fetchT } from '@sapphire/plugin-i18next';
import { Guild, Permissions } from 'discord.js';

export class UserModerationTask extends ModerationTask {
	protected async handle(guild: Guild, data: ModerationData) {
		const me = guild.me === null ? await guild.members.fetch(process.env.CLIENT_ID) : guild.me;
		if (!me.permissions.has(Permissions.FLAGS.BAN_MEMBERS)) return null;

		const t = await fetchT(guild);
		await (
			await getSecurity(guild)
		).actions.unBan(
			{
				moderatorId: process.env.CLIENT_ID,
				userId: data.userID,
				reason: `[MODERATION] Ban released after ${t('globals:durationValue', { value: data.duration })}`
			},
			await this.getTargetDM(guild, await this.container.gatewayClient.users.fetch(data.userID))
		);
		return null;
	}
}
