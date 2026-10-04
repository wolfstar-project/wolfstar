import { ModerationActions, ModerationTask, type ModerationData } from '#lib/moderation';
import type { Guild } from '@wolfstar/plugin-gateway';
import { PermissionFlagsBits } from 'discord-api-types/v10';

export class UserModerationTask extends ModerationTask {
	protected async handle(guild: Guild, data: ModerationData) {
		if (!(await this.hasPermissions(guild, PermissionFlagsBits.BanMembers))) return null;

		const reason = await this.getReason(guild, 'Ban released', data.duration);
		await ModerationActions.ban.undo(guild, { user: data.userID, reason }, await this.getActionData(guild, data.userID));
		return null;
	}
}
