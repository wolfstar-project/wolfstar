import { ModerationActions, ModerationTask, type ModerationData } from '#lib/moderation';
import type { Guild } from '@wolfstar/plugin-gateway';

export class UserModerationTask extends ModerationTask {
	protected async handle(guild: Guild, data: ModerationData) {
		const reason = await this.getReason(guild, 'Ban released', data.duration);
		await ModerationActions.ban.undo(guild, { user: data.userID, reason }, await this.getActionData(guild));
	}
}
