import { readSettings } from '#lib/database';
import type { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import type { UndoTaskName } from '#lib/moderation/common';
import { translateKey } from '#lib/structures/commands/utils';
import { getModeration } from '#utils/functions';
import type { SchemaKeys } from '#utils/moderationConstants';
import type { Guild } from '@wolfstar/plugin-gateway';
import { fetchT } from '@wolfstar/plugin-i18next';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';

/**
 * The base of the tasks that undo a temporary moderation action when its time is up (`moderationEnd*`, in
 * `src/scheduled-tasks/moderation`).
 *
 * @remarks
 *
 * `ModerationManager` schedules one when a case with a duration is created, as a job that carries
 * {@linkcode ModerationData}, and removes it when the case is edited, completed or deleted. Whatever the outcome of
 * {@linkcode ModerationTask.handle}, the case is marked as completed, so a task that cannot undo its action (the member
 * left, the bot lost its permissions) is not tried forever.
 */
export abstract class ModerationTask<T = unknown> extends ScheduledTask<UndoTaskName> {
	public override async run(payload: ModerationData) {
		const data = payload as ModerationData<T>;

		// The bot is not in the guild anymore, there is nothing to undo:
		const guild = await this.container.gatewayClient.guilds.resolve(data.guildID);
		if (guild === null) return;

		try {
			await this.handle(guild, data);
		} catch (error) {
			this.container.logger.debug(`[${this.name}] Could not undo the case ${data.caseID} of ${data.guildID}:`, error);
		}

		// Mark the moderation entry as complete.
		try {
			await (await getModeration(guild)).complete(data.caseID);
		} catch {
			// The case was deleted in the meantime.
		}
	}

	/**
	 * The reason of the action that undoes the case, for the audit log and the moderation log.
	 *
	 * @param guild - The guild the case belongs to.
	 * @param action - What happens, e.g. `Ban released`.
	 * @param duration - The duration the case had.
	 */
	protected async getReason(guild: Guild, action: string, duration: number) {
		const t = await fetchT(guild);
		return `[MODERATION] ${action} after ${translateKey(t, 'globals:durationValue', { value: duration })}`;
	}

	/**
	 * The data of the action that undoes the case: nobody is shown as the moderator, and the user is told when the
	 * guild sends direct messages for its moderation actions.
	 *
	 * @param guild - The guild the case belongs to.
	 * @param context - The context of the action, e.g. the role to give back.
	 */
	protected async getActionData<ContextType = never>(guild: Guild, context?: ContextType): Promise<ModerationAction.Data<ContextType>> {
		const settings: Partial<Record<string, unknown>> = await readSettings(guild);
		return { moderator: null, sendDirectMessage: settings.messagesModerationDm === true, context };
	}

	protected abstract handle(guild: Guild, data: ModerationData<T>): unknown;
}

export interface ModerationData<T = unknown> {
	[SchemaKeys.Case]: number;
	[SchemaKeys.Guild]: string;
	[SchemaKeys.User]: string;
	[SchemaKeys.Duration]: number;
	[SchemaKeys.ExtraData]: T;
}

declare module '@wolfstar/plugin-scheduled-tasks' {
	interface ScheduledTasks extends Record<UndoTaskName, ModerationData> {}
}
