import { ModerationActions, ModerationTask, type ModerationData } from '#lib/moderation';
import type { Guild } from '@wolfstar/plugin-gateway';
import { PermissionFlagsBits, type Snowflake } from 'discord-api-types/v10';

export class UserModerationTask extends ModerationTask<{ role: Snowflake }> {
	protected async handle(guild: Guild, data: ModerationData<{ role: Snowflake }>) {
		await this.requirePermissions(guild, PermissionFlagsBits.ManageRoles);

		const reason = await this.getReason(guild, 'Role re-added', data.duration);
		await ModerationActions.roleRemove.undo(
			guild,
			{ user: data.userID, reason },
			await this.getActionData(guild, data.userID, { id: data.extraData.role })
		);
		return null;
	}
}
