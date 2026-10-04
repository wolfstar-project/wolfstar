import { ModerationActions, ModerationTask, type ModerationData } from '#lib/moderation';
import type { Guild } from '@wolfstar/plugin-gateway';

export class UserModerationTask extends ModerationTask<{ oldName: string | null }> {
	protected async handle(guild: Guild, data: ModerationData<{ oldName: string | null }>) {
		const reason = await this.getReason(guild, 'Nickname reverted', data.duration);
		await ModerationActions.setNickname.undo(guild, { user: data.userID, reason }, await this.getActionData(guild, data.extraData.oldName));
	}
}
