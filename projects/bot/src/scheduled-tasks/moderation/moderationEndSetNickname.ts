import { ModerationActions, ModerationTask, type ModerationData } from '#lib/moderation';
import type { Guild } from '@wolfstar/plugin-gateway';
import { PermissionFlagsBits } from 'discord-api-types/v10';

export class UserModerationTask extends ModerationTask<{ oldName: string | null }> {
	protected async handle(guild: Guild, data: ModerationData<{ oldName: string | null }>) {
		if (!(await this.hasPermissions(guild, PermissionFlagsBits.ManageNicknames))) return null;

		const reason = await this.getReason(guild, 'Nickname reverted', data.duration);
		await ModerationActions.setNickname.undo(
			guild,
			{ user: data.userID, reason },
			await this.getActionData(guild, data.userID, data.extraData.oldName)
		);
		return null;
	}
}
