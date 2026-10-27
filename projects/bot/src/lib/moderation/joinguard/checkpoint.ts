import { resolveOnErrorCodes } from '#common';
import { fetchUserReportEnabled } from '#lib/database';
import { ModerationActions } from '#lib/moderation/actions/index';
import { fetchGuildT } from '#lib/moderation/common';
import {
	describeJoinGuardError,
	describeJoinGuardMissingPermissions,
	describeJoinGuardRoleProblem,
	sendJoinGuardLog
} from '#lib/moderation/joinguard/log';
import { getJoinGuardRoleProblem, getJoinGuardTargetProblem, getMissingJoinGuardPermissions } from '#lib/moderation/joinguard/permissions';
import type { JoinGuardLogEntry } from '#lib/moderation/joinguard/render';
import { withJoinGuardMemberLock } from '#lib/moderation/joinguard/store';
import { getModeration } from '#utils/functions';
import { container } from '@wolfstar/http-framework';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import { RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import {
	fetchJoinGuardCheckpoint,
	fetchTableSettings,
	fetchWaitingJoinGuardCheckpoint,
	leaveJoinGuardCheckpoints,
	reopenJoinGuardCheckpoint,
	resolveJoinGuardCheckpoint,
	setJoinGuardCheckpointCase,
	type JoinGuardCheckpoint,
	type JoinGuardSettings
} from 'wolfstar-database';

const Root = 'events/join-guard';

/**
 * Why something asked of the join guard could not be done. The website reads it from the `error` column of a request,
 * as `<code>: <detail>`, so the codes are a contract with it.
 */
export const JoinGuardFailureCodes = [
	'InvalidRequest',
	'UnknownGuild',
	'NotWaiting',
	'NotMember',
	'MissingPermissions',
	'NotAllowed',
	'RoleNotManageable',
	'NoChannel',
	'UnknownChannel',
	'Refused',
	'Failed'
] as const;
export type JoinGuardFailureCode = (typeof JoinGuardFailureCodes)[number];

export interface JoinGuardFailure {
	readonly code: JoinGuardFailureCode;
	readonly detail: string;
}

export type JoinGuardResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: JoinGuardFailure };

export function joinGuardOk<T>(value: T): JoinGuardResult<T> {
	return { ok: true, value };
}

export function joinGuardErr<T = never>(code: JoinGuardFailureCode, detail: string): JoinGuardResult<T> {
	return { ok: false, error: { code, detail } };
}

/**
 * The ID of the job of the timeout of a row of the queue, so it is found again to be removed.
 */
function getJoinGuardTimeoutTaskId(checkpointId: string) {
	return `joinguard-checkpoint-${checkpointId}`;
}

/**
 * Schedules the timeout of a member sent to the checkpoint, see the `joinGuardCheckpointTimeout` task.
 *
 * @param checkpointId - The row of the member.
 * @param seconds - How long they have to pass the checkpoint.
 */
export async function scheduleJoinGuardTimeout(checkpointId: string, seconds: number) {
	await container.tasks.create(
		{ name: 'joinGuardCheckpointTimeout', payload: { checkpointId } },
		{
			repeated: false,
			delay: seconds * 1000,
			customJobOptions: { jobId: getJoinGuardTimeoutTaskId(checkpointId), removeOnComplete: true, removeOnFail: true }
		}
	);
}

/**
 * Removes the timeout of a member who no longer waits. The job does nothing for a row that does not wait anyway, so a
 * job that cannot be removed only runs for nothing: the failure is logged and not thrown.
 */
async function cancelJoinGuardTimeout(checkpointId: string) {
	try {
		await container.tasks.delete(getJoinGuardTimeoutTaskId(checkpointId));
	} catch (error) {
		container.logger.debug(`[JoinGuard] Could not remove the timeout of the row ${checkpointId}:`, error);
	}
}

function readSettings(guildId: Snowflake) {
	// Read from the table, not from the cache: the dashboard may have changed the roles since.
	return fetchTableSettings(container.prisma.orm, 'GuildJoinGuard', guildId);
}

function fetchMember(guildId: Snowflake, userId: Snowflake) {
	return resolveOnErrorCodes(container.gatewayClient.members.fetch(guildId, userId), RESTJSONErrorCodes.UnknownMember);
}

async function fetchLogUser(member: GuildMember | null, userId: Snowflake) {
	const user = member?.user ?? (await resolveOnErrorCodes(container.gatewayClient.users.fetch(userId), RESTJSONErrorCodes.UnknownUser));
	return user?.toJSON() ?? { id: userId, username: userId, discriminator: '0', avatar: null, global_name: null };
}

/**
 * How a member is let in: by the checkpoint page, which measured their trust, or by a moderator.
 */
export type JoinGuardAdmission =
	| { readonly kind: 'Checkpoint'; readonly trust: number; readonly linkedAccounts: number; readonly checkpointId: string | null }
	| { readonly kind: 'Moderator'; readonly moderatorId: Snowflake };

/**
 * What letting a member in did.
 */
export interface JoinGuardAdmitted {
	/** The row of the member who waited, `null` when a moderator let in one who did not. */
	readonly checkpoint: JoinGuardCheckpoint | null;
	/** Whether a role was given or taken. */
	readonly changedRoles: boolean;
}

/**
 * Lets a member in: the pending role is taken, the verified role given, and the row of the member who waits is
 * resolved as `Verified`.
 *
 * @remarks
 *
 * The page lets in a member who waits only. A moderator lets in any member, the ones the guard never stopped included.
 * The row is resolved first, so a timeout or a kick that comes at the same time finds the member no longer waiting,
 * and it waits again when the roles could not be changed.
 *
 * @param guildId - The guild.
 * @param userId - The member.
 * @param admission - Who lets them in.
 */
export function admitJoinGuardMember(
	guildId: Snowflake,
	userId: Snowflake,
	admission: JoinGuardAdmission
): Promise<JoinGuardResult<JoinGuardAdmitted>> {
	return withJoinGuardMemberLock(guildId, userId, async () => {
		const guild = await container.gatewayClient.guilds.resolve(guildId);
		if (guild === null) return joinGuardErr('UnknownGuild', 'The bot is not in the guild.');

		const t = await fetchGuildT(guild);
		const settings = await readSettings(guildId);
		const waiting = await fetchWaitingJoinGuardCheckpoint(container.prisma.orm, guildId, userId);
		if (admission.kind === 'Checkpoint' && (waiting === null || (admission.checkpointId !== null && waiting.id !== admission.checkpointId))) {
			return joinGuardErr('NotWaiting', 'The member does not wait at the checkpoint.');
		}

		const member = await fetchMember(guildId, userId);
		if (member === null) return joinGuardErr('NotMember', 'The member is not in the guild.');

		const problem = await findRoleProblem(t, guildId, settings);
		if (problem !== null) return joinGuardErr('RoleNotManageable', problem);

		const status = 'Verified' as const;
		if (waiting !== null) {
			const claimed = await resolveJoinGuardCheckpoint(container.prisma, waiting.id, {
				status,
				resolution: admission.kind,
				moderatorId: admission.kind === 'Moderator' ? admission.moderatorId : null,
				...(admission.kind === 'Checkpoint' ? { trust: admission.trust, linkedAccounts: admission.linkedAccounts } : {})
			});
			if (!claimed) return joinGuardErr('NotWaiting', 'The member does not wait at the checkpoint anymore.');
		}

		const roles = await changeAdmittedRoles(t, member, settings);
		if (!roles.ok) {
			if (waiting !== null) await reopenJoinGuardCheckpoint(container.prisma, waiting.id, status);
			return roles;
		}

		if (waiting !== null) await cancelJoinGuardTimeout(waiting.id);
		const entry: JoinGuardLogEntry =
			admission.kind === 'Checkpoint'
				? { kind: 'Verified', trust: admission.trust, linkedAccounts: admission.linkedAccounts, errors: [] }
				: { kind: 'VerifiedByModerator', moderatorId: admission.moderatorId, errors: [] };
		if (waiting !== null || roles.value) sendJoinGuardLog(guild, settings.joinGuardLogChannel, await fetchLogUser(member, userId), entry);

		return joinGuardOk({ checkpoint: waiting, changedRoles: roles.value });
	});
}

async function findRoleProblem(t: TFunction<AnyNamespace>, guildId: Snowflake, settings: JoinGuardSettings): Promise<string | null> {
	for (const roleId of [settings.joinGuardPendingRole, settings.joinGuardVerifiedRole]) {
		if (roleId === null) continue;

		const problem = await getJoinGuardRoleProblem(guildId, roleId);
		if (problem !== null) return t(`${Root}:errorRole`, { role: `<@&${roleId}>`, reason: describeJoinGuardRoleProblem(t, problem) });
	}
	return null;
}

/**
 * Takes the pending role of a member who is let in and gives them the verified role.
 *
 * @returns Whether a role changed.
 */
async function changeAdmittedRoles(t: TFunction<AnyNamespace>, member: GuildMember, settings: JoinGuardSettings): Promise<JoinGuardResult<boolean>> {
	const pending = settings.joinGuardPendingRole;
	const verified = settings.joinGuardVerifiedRole;
	const roleIds = member.roles.ids;
	try {
		let changed = false;
		if (pending !== null && roleIds.includes(pending)) {
			await member.roles.remove(pending, t(`${Root}:verifiedRoleReason`));
			changed = true;
		}
		if (verified !== null && !roleIds.includes(verified)) {
			await member.roles.add(verified, t(`${Root}:verifiedRoleReason`));
			changed = true;
		}
		return joinGuardOk(changed);
	} catch (error) {
		return joinGuardErr('Refused', describeJoinGuardError(t, 'Roles', error));
	}
}

/**
 * Kicks a member as a moderator of the dashboard asked, as a case in their name, and resolves the row of the member
 * who waits as `Kicked`.
 *
 * @remarks The website decides who may ask (the users who can manage the guild); the bot then applies the checks of
 * the moderation commands to the target: not the moderator themselves, the owner nor the bot, and below the highest
 * role of the moderator and of the bot.
 *
 * @param guildId - The guild.
 * @param userId - The member.
 * @param moderatorId - The user of the dashboard who asked.
 * @param reason - The reason of the case.
 */
export function kickJoinGuardMember(
	guildId: Snowflake,
	userId: Snowflake,
	moderatorId: Snowflake,
	reason: string | null
): Promise<JoinGuardResult<{ caseId: number }>> {
	return withJoinGuardMemberLock(guildId, userId, async () => {
		const guild = await container.gatewayClient.guilds.resolve(guildId);
		if (guild === null) return joinGuardErr('UnknownGuild', 'The bot is not in the guild.');

		const t = await fetchGuildT(guild);
		const member = await fetchMember(guildId, userId);
		if (member === null) return joinGuardErr('NotMember', 'The member is not in the guild.');

		const missing = await getMissingJoinGuardPermissions(guildId, ['kick']);
		if (missing.length > 0) return joinGuardErr('MissingPermissions', describeJoinGuardMissingPermissions(t, 'Kick', missing));

		// The dashboard checked that the user may manage the guild; the target is checked here, as `/kick` does:
		const problem = await getJoinGuardTargetProblem(t, guild, userId, moderatorId);
		if (problem !== null) return joinGuardErr('NotAllowed', problem);

		const settings = await readSettings(guildId);
		const waiting = await fetchWaitingJoinGuardCheckpoint(container.prisma.orm, guildId, userId);
		const status = 'Kicked' as const;
		if (waiting !== null && !(await resolveJoinGuardCheckpoint(container.prisma, waiting.id, { status, resolution: 'Moderator', moderatorId }))) {
			return joinGuardErr('NotWaiting', 'The member does not wait at the checkpoint anymore.');
		}

		const kicked = await kickMember(guild, t, member, { reason, moderatorId });
		if (!kicked.ok) {
			if (waiting !== null) await reopenJoinGuardCheckpoint(container.prisma, waiting.id, status);
			return kicked;
		}

		if (waiting !== null) {
			await setJoinGuardCheckpointCase(container.prisma, waiting.id, kicked.value.caseId);
			await cancelJoinGuardTimeout(waiting.id);
		}
		sendJoinGuardLog(guild, settings.joinGuardLogChannel, await fetchLogUser(member, userId), {
			kind: 'KickedByModerator',
			moderatorId,
			caseId: kicked.value.caseId
		});
		return kicked;
	});
}

async function kickMember(
	guild: Guild,
	t: TFunction<AnyNamespace>,
	member: GuildMember,
	options: { reason: string | null; moderatorId: Snowflake | null }
): Promise<JoinGuardResult<{ caseId: number }>> {
	const user = member.user ?? (await member.fetchUser());
	const moderator =
		options.moderatorId === null
			? null
			: await resolveOnErrorCodes(container.gatewayClient.users.fetch(options.moderatorId), RESTJSONErrorCodes.UnknownUser);
	// The lock holds the logs of the guild back until the case is made, so the kick is not tracked as a second one:
	const unlock = (await getModeration(guild)).createLock();
	try {
		const entry = await ModerationActions.kick.apply(
			guild,
			{ user, reason: options.reason, ...(options.moderatorId === null ? {} : { moderator: options.moderatorId }) },
			{ sendDirectMessage: await fetchUserReportEnabled(user.id), moderator }
		);
		return joinGuardOk({ caseId: entry.id });
	} catch (error) {
		return joinGuardErr('Refused', describeJoinGuardError(t, 'Kick', error));
	} finally {
		unlock();
	}
}

/**
 * What the timeout of a member who waited did.
 */
export type JoinGuardTimeoutOutcome =
	| { readonly kind: 'Resolved' }
	| { readonly kind: 'UnknownGuild' }
	| { readonly kind: 'Left' }
	| { readonly kind: 'LetIn' }
	| { readonly kind: 'Failed'; readonly error: string }
	| { readonly kind: 'Kicked'; readonly caseId: number };

/**
 * Kicks a member who did not pass the checkpoint in time, as a case of the bot, when nothing let them in since.
 *
 * @remarks
 *
 * The job only carries the ID of the row, and the row is read again under the lock of the member: an old job acts only
 * when the row still waits, which it does not once the member was verified, let in, kicked or left, nor after they
 * joined again (their new stay has a row of its own, and the old one was marked as left). A member still waits when
 * they are in the guild with the pending role and without the verified role; one who lost the pending role, or got the
 * verified one, was let in by hand, and is resolved as such instead of kicked. A member who is gone left while the bot
 * did not see it.
 *
 * @param checkpointId - The row of the member.
 */
export async function runJoinGuardTimeout(checkpointId: string): Promise<JoinGuardTimeoutOutcome> {
	const { orm } = container.prisma;
	const first = await fetchJoinGuardCheckpoint(orm, checkpointId);
	if (first === null || first.status !== 'Waiting') return { kind: 'Resolved' };

	return withJoinGuardMemberLock(first.guildId, first.userId, async () => {
		const row = await fetchJoinGuardCheckpoint(orm, checkpointId);
		if (row === null || row.status !== 'Waiting') return { kind: 'Resolved' };

		const guild = await container.gatewayClient.guilds.resolve(row.guildId);
		if (guild === null) return { kind: 'UnknownGuild' };

		const settings = await readSettings(row.guildId);
		const member = await fetchMember(row.guildId, row.userId);
		const user = await fetchLogUser(member, row.userId);
		if (member === null) {
			if (await resolveJoinGuardCheckpoint(container.prisma, row.id, { status: 'Left', resolution: null })) {
				sendJoinGuardLog(guild, settings.joinGuardLogChannel, user, { kind: 'Left' });
			}
			return { kind: 'Left' };
		}

		if (isLetIn(member.roles.ids, settings)) {
			if (await resolveJoinGuardCheckpoint(container.prisma, row.id, { status: 'Verified', resolution: 'Moderator', moderatorId: null })) {
				sendJoinGuardLog(guild, settings.joinGuardLogChannel, user, { kind: 'VerifiedByHand' });
			}
			return { kind: 'LetIn' };
		}

		const t = await fetchGuildT(guild);
		const missing = await getMissingJoinGuardPermissions(row.guildId, ['kick']);
		if (missing.length > 0) return failTimeout(guild, settings, user, describeJoinGuardMissingPermissions(t, 'Timeout', missing));

		const status = 'Kicked' as const;
		if (!(await resolveJoinGuardCheckpoint(container.prisma, row.id, { status, resolution: 'Timeout' }))) return { kind: 'Resolved' };

		const hours = Math.max(1, Math.round(((row.expiresAt ?? Date.now()) - row.createdAt) / 3_600_000));
		const kicked = await kickMember(guild, t, member, { reason: t(`${Root}:caseTimeoutReason`, { hours }), moderatorId: null });
		if (!kicked.ok) {
			await reopenJoinGuardCheckpoint(container.prisma, row.id, status);
			return failTimeout(guild, settings, user, kicked.error.detail);
		}

		await setJoinGuardCheckpointCase(container.prisma, row.id, kicked.value.caseId);
		sendJoinGuardLog(guild, settings.joinGuardLogChannel, user, { kind: 'TimedOut', caseId: kicked.value.caseId });
		return { kind: 'Kicked', caseId: kicked.value.caseId };
	});
}

/**
 * Whether a member who waits was let in by hand: they lost the pending role, or got the verified one. Without either
 * role set, nothing says so, and the member still waits.
 */
function isLetIn(roleIds: readonly Snowflake[], settings: Pick<JoinGuardSettings, 'joinGuardPendingRole' | 'joinGuardVerifiedRole'>) {
	const pending = settings.joinGuardPendingRole;
	const verified = settings.joinGuardVerifiedRole;
	return (pending !== null && !roleIds.includes(pending)) || (verified !== null && roleIds.includes(verified));
}

function failTimeout(
	guild: Guild,
	settings: JoinGuardSettings,
	user: Parameters<typeof sendJoinGuardLog>[2],
	error: string
): JoinGuardTimeoutOutcome {
	sendJoinGuardLog(guild, settings.joinGuardLogChannel, user, { kind: 'Failed', errors: [error] });
	return { kind: 'Failed', error };
}

/**
 * Marks as left a member who waited at the checkpoint and left the guild, and removes their timeout.
 *
 * @param guild - The guild.
 * @param userId - The member who left.
 */
export function leaveJoinGuardMember(guild: Guild, userId: Snowflake): Promise<readonly JoinGuardCheckpoint[]> {
	return withJoinGuardMemberLock(guild.id, userId, async () => {
		const rows = await leaveJoinGuardCheckpoints(container.prisma, guild.id, userId);
		if (rows.length === 0) return rows;

		for (const row of rows) await cancelJoinGuardTimeout(row.id);
		const settings = await readSettings(guild.id);
		sendJoinGuardLog(guild, settings.joinGuardLogChannel, await fetchLogUser(null, userId), { kind: 'Left' });
		return rows;
	});
}
