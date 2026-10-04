import { ModerationActions, ModerationTask, type ModerationData } from '#lib/moderation';
import type { Guild } from '@wolfstar/plugin-gateway';
import type { Snowflake } from 'discord-api-types/v10';

export class UserModerationTask extends ModerationTask<{ role: Snowflake }> {
	protected async handle(guild: Guild, data: ModerationData<{ role: Snowflake }>) {
		const reason = await this.getReason(guild, 'Role removed', data.duration);
		await ModerationActions.roleAdd.undo(guild, { user: data.userID, reason }, await this.getActionData(guild, { id: data.extraData.role }));
	}
}
