import { fetchUserReportEnabled, readSettings } from '#lib/database';
import type { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import type { UndoTaskName } from '#lib/moderation/common';
import { translateKey } from '#lib/structures/commands/utils';
import { getModeration } from '#utils/functions';
import type { SchemaKeys } from '#utils/moderationConstants';
import { DiscordAPIError } from '@discordjs/rest';
import type { Guild } from '@wolfstar/plugin-gateway';
import { fetchT } from '@wolfstar/plugin-i18next';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';
import { PermissionFlagsBits, type Snowflake } from 'discord-api-types/v10';

/**
 * The base of the tasks that undo a temporary moderation action when its time is up (`moderationEnd*`, in
 * `src/scheduled-tasks/moderation`).
 *
 * @remarks
 *
 * The `moderationEntryAdd` and `moderationEntryEdit` listeners schedule one as a job that carries
 * {@linkcode ModerationData}. The outcomes of the original schedule map to the job this way:
 *
 * - ignore, when the bot is not in the guild anymore: the job ends, there is nothing to undo.
 * - delay, when the gateway is not ready yet or the guild is not available (a Discord outage): the task throws, and
 *   the job is tried again 20 seconds later (see `UndoTaskJobOptions`).
 * - finished: whatever the outcome of {@linkcode ModerationTask.handle}, the case is marked as completed.
 */
export abstract class ModerationTask<T = unknown> extends ScheduledTask<UndoTaskName> {
	public override async run(payload: ModerationData) {
		const data = payload as ModerationData<T>;
		const { gatewayClient } = this.container;

		// If the guilds are not available yet, re-schedule the task by failing the job, which is tried again later.
		if (!gatewayClient.isClientReady()) throw new Error('The gateway client is not ready yet.');

		const guild = await gatewayClient.guilds.resolve(data.guildID);
		// If the bot is not in the guild anymore, cancel the task.
		if (guild === null) return;

		// If the guild is not available, re-schedule the task the same way, it is tried again 20 seconds later.
		if (!guild.available) throw new Error(`The guild ${guild.id} is not available.`);

		// Run the abstract handle function.
		try {
			await this.handle(guild, data);
		} catch (error) {
			// What Discord refuses for good (the ban is gone, the role was deleted, a permission is missing) is not
			// tried again, and the case is completed. Anything else fails the job, which is tried again later.
			if (!isPermanentError(error)) throw error;
			this.container.logger.debug(`[MODERATION] The undo of case ${data.caseID} of ${guild.id} was refused:`, error);
		}

		// Mark the moderation entry as complete.
		try {
			await (await getModeration(guild)).complete(data.caseID);
		} catch {
			// The case was deleted in the meantime.
		}
	}

	/**
	 * Whether the bot has guild-wide permissions, see {@linkcode ModerationTask.requirePermissions}.
	 *
	 * @param guild - The guild the case belongs to.
	 * @param permissions - The permissions to check, see {@linkcode PermissionFlagsBits}.
	 */
	protected async hasPermissions(guild: Guild, permissions: bigint) {
		const me = await this.container.gatewayClient.members.fetchMe(guild.id);
		const granted = (await me.permissions).bitField;
		return (granted & PermissionFlagsBits.Administrator) !== 0n || (granted & permissions) === permissions;
	}

	/**
	 * Fails the job when the bot lacks the permissions its undo needs, so the case is not completed for an undo that
	 * was not made: the job is tried again while it has attempts left, should the permissions come back.
	 *
	 * @param guild - The guild the case belongs to.
	 * @param permissions - The permissions the undo needs, see {@linkcode PermissionFlagsBits}.
	 */
	protected async requirePermissions(guild: Guild, permissions: bigint) {
		if (await this.hasPermissions(guild, permissions)) return;
		throw new Error(`Missing the permissions (${permissions}) to undo a case of the guild ${guild.id}.`);
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
	 * The data of the action that undoes the case: nobody is shown as the moderator, and the user is told when both
	 * the guild and the user have the moderation direct messages on.
	 *
	 * @param guild - The guild the case belongs to.
	 * @param targetId - The user the case is about.
	 * @param context - The context of the action, e.g. the role to give back.
	 */
	protected async getActionData<ContextType = never>(
		guild: Guild,
		targetId: Snowflake,
		context?: ContextType
	): Promise<ModerationAction.Data<ContextType>> {
		const settings: Partial<Record<string, unknown>> = await readSettings(guild);
		return {
			moderator: null,
			sendDirectMessage: settings.messagesModerationDm === true && (await fetchUserReportEnabled(targetId)),
			context
		};
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

/**
 * Whether an error is an answer of Discord that the same request would get again: a client error that is not a rate
 * limit. A network failure or a server error is not.
 */
function isPermanentError(error: unknown): boolean {
	return error instanceof DiscordAPIError && error.status >= 400 && error.status < 500 && error.status !== 429;
}
