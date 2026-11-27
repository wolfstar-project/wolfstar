import { resolveOnErrorCodes } from '#common';
import { ModerationActions } from '#lib/moderation/actions/index';
import { fetchGuildT } from '#lib/moderation/common';
import { getModeration } from '#utils/functions';
import {
	decideOnboardingAnswer,
	getOnboardingDeadline,
	getOnboardingFailureReason,
	getOnboardingStep,
	selectCurrentStay,
	type OnboardingFailureReason,
	type OnboardingStep
} from '#lib/onboarding/flow';
import { sendOnboardingLog, type OnboardingFailureOutcome } from '#lib/onboarding/log';
import { readOnboardingConfig, withOnboardingMemberLock } from '#lib/onboarding/store';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import { GuildMemberFlags, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import {
	createOnboardingVerification,
	fetchOnboardingConfig,
	fetchOnboardingStages,
	fetchOnboardingVerification,
	fetchOnboardingVerifications,
	fetchWaitingOnboardingVerifications,
	leaveOnboardingMember,
	recordOnboardingAttempt,
	resolveOnboardingVerification,
	type OnboardingConfig,
	type OnboardingStage,
	type OnboardingVerification
} from 'wolfstar-database';

/**
 * How many times the job of a row is tried when Discord refuses the failure action (the bot lost a permission), and how
 * long the first retry waits, doubled after each: about five hours in all, the log telling each failure.
 */
const OnboardingJobAttempts = 6;
const OnboardingJobRetryDelay = 600_000;

/**
 * The ID of the job that checks a member's row at a moment: when their time limit runs out, or when a failure action
 * Discord refused is tried again.
 *
 * @remarks The moment is part of the ID. BullMQ ignores a new job whose ID is taken, also by the job that runs now, so
 * a job that moves the deadline needs an ID of its own. The same row and moment give the same ID, so a job scheduled
 * twice is one job.
 *
 * @param runAt - When the job runs, in milliseconds since the epoch.
 */
export function getOnboardingTimeLimitTaskId(verificationId: string, runAt: number) {
	return `onboarding-${verificationId}-${runAt}`;
}

/**
 * Whether a member completed Discord's own onboarding of the guild.
 */
export function hasCompletedNativeOnboarding(member: Pick<GuildMember, 'flags'>): boolean {
	return member.flags.has(GuildMemberFlags.CompletedOnboarding);
}

/**
 * Reads where a member is in the onboarding, and starts the next stage when it can start. Nothing is done while the
 * module is off, for a bot, or in a guild with no enabled stage.
 *
 * @remarks Call it under {@linkcode withOnboardingMemberLock}: the join, the completion of Discord's onboarding and a
 * pass all call it, and two at once would start the same stage twice.
 *
 * @param member - The member, with their join time and their flags.
 * @param config - The onboarding of the guild.
 * @returns Where the member is once the stage started, `null` when the onboarding does nothing for them.
 */
export async function advanceOnboardingLocked(member: GuildMember, config: OnboardingConfig): Promise<OnboardingStep | null> {
	const userId = member.id;
	if (userId === null || !config.settings.enabled || member.user?.bot || !config.stages.some((stage) => stage.enabled)) return null;
	const rows = await fetchOnboardingVerifications(container.prisma.orm, member.guildId, userId);
	const step = getOnboardingStep(config.stages, selectCurrentStay(rows, member.joinedTimestamp), hasCompletedNativeOnboarding(member));
	container.logger.debug(`[Onboarding] ${userId} in ${member.guildId}: ${step.kind}`);
	if (step.kind === 'Waiting') await repairOnboardingTimeLimit(step.stage, step.verification);
	if (step.kind !== 'Start') return step;

	const verification = await startOnboardingStage(member.guildId, userId, step.stage);
	return { kind: 'Waiting', stage: step.stage, verification };
}

/**
 * Starts the onboarding of a member who joined, or who completed Discord's onboarding: the next stage starts when its
 * trigger allows it.
 */
export async function advanceOnboarding(member: GuildMember): Promise<OnboardingStep | null> {
	const config = await readOnboardingConfig(member.guildId);
	if (!config.settings.enabled) return null;

	const userId = member.id;
	if (userId === null) return null;

	return withOnboardingMemberLock(member.guildId, userId, () => advanceOnboardingLocked(member, config));
}

/**
 * Writes the row of a stage that starts, and schedules its time limit.
 *
 * @remarks A row that waits with no job would never fail by its time limit: when the job cannot be scheduled, the row
 * is marked as left and the error is thrown, so the next press starts the stage again.
 */
export async function startOnboardingStage(guildId: Snowflake, userId: Snowflake, stage: OnboardingStage): Promise<OnboardingVerification> {
	const verification = await createOnboardingVerification(container.prisma, { guildId, userId, stage });
	try {
		await scheduleOnboardingTimeLimit(stage, verification);
	} catch (error) {
		await resolveOnboardingVerification(container.prisma, verification.id, 'Left');
		throw error;
	}
	return verification;
}

/**
 * Schedules the job of a member's time limit, at the deadline the stage gives now. Nothing is scheduled for a stage
 * with no time limit, and a job already scheduled at that deadline is kept as it is.
 */
export async function scheduleOnboardingTimeLimit(
	stage: Pick<OnboardingStage, 'timeLimit'>,
	verification: Pick<OnboardingVerification, 'id' | 'createdAt'>
): Promise<void> {
	const deadline = getOnboardingDeadline(stage, verification);
	if (deadline !== null) await scheduleOnboardingJob(verification.id, deadline);
}

async function scheduleOnboardingJob(verificationId: string, runAt: number) {
	await container.tasks.create(
		{ name: 'onboardingTimeLimit', payload: { verificationId, runAt } },
		{
			repeated: false,
			delay: Math.max(runAt - Date.now(), 0),
			customJobOptions: {
				jobId: getOnboardingTimeLimitTaskId(verificationId, runAt),
				// A failure action Discord refused leaves the member waiting, so the job throws and is tried again:
				attempts: OnboardingJobAttempts,
				backoff: { type: 'exponential', delay: OnboardingJobRetryDelay },
				removeOnComplete: true,
				removeOnFail: true
			}
		}
	);
}

/**
 * Schedules the time limit of a member who waits again, in case its job was lost. The member can still pass the stage
 * without it, so a failure is logged and not thrown.
 */
async function repairOnboardingTimeLimit(stage: OnboardingStage, verification: OnboardingVerification) {
	try {
		await scheduleOnboardingTimeLimit(stage, verification);
	} catch (error) {
		container.logger.error(`[Onboarding] Could not schedule the time limit of the row ${verification.id}:`, error);
	}
}

/**
 * The time limit of a row whose member no longer waits does nothing anyway, so a job that cannot be removed only runs
 * for nothing: the failure is logged and not thrown. A job scheduled at a deadline the stage had before is left to run.
 */
async function cancelOnboardingTimeLimit(stage: Pick<OnboardingStage, 'timeLimit'>, verification: OnboardingVerification) {
	const deadline = getOnboardingDeadline(stage, verification);
	if (deadline === null) return;

	try {
		await container.tasks.delete(getOnboardingTimeLimitTaskId(verification.id, deadline));
	} catch (error) {
		container.logger.debug(`[Onboarding] Could not remove the time limit of the row ${verification.id}:`, error);
	}
}

/**
 * Makes the time limits of a guild's stages, as they are saved now, apply to the members who wait: each gets a job at
 * the deadline of their stage, so a limit made shorter, or added, acts at once. A job at a later deadline the stage had
 * before runs for nothing, and one at an earlier deadline schedules the new one. A row of a stage that was deleted
 * does not wait anymore: it is marked as left.
 *
 * @remarks Call it after every write of the stages, the panel's and the dashboard's.
 */
export async function syncOnboardingTimeLimits(guildId: Snowflake): Promise<{ scheduled: number; left: number }> {
	const { orm } = container.prisma;
	const stages = await fetchOnboardingStages(orm, guildId);
	const rows = await fetchWaitingOnboardingVerifications(orm, guildId);

	let scheduled = 0;
	let left = 0;
	for (const row of rows) {
		const stage = stages.find((entry) => entry.id === row.stageId);
		if (stage === undefined) {
			if (await resolveOnboardingVerification(container.prisma, row.id, 'Left')) left++;
			continue;
		}

		if (getOnboardingDeadline(stage, row) === null) continue;
		await scheduleOnboardingTimeLimit(stage, row);
		scheduled++;
	}

	return { scheduled, left };
}

/**
 * What a member answering a stage right led to:
 * - `Passed`: the row is passed, and `next` is where they are now.
 * - `RoleRefused`: Discord refused the stage's role, so the row still waits: the member answers again to get it.
 * - `Stale`: the row no longer waited.
 */
export type OnboardingPassResult =
	| { readonly kind: 'Passed'; readonly next: OnboardingStep | null }
	| { readonly kind: 'RoleRefused'; readonly error: string }
	| { readonly kind: 'Stale' };

/**
 * Passes a member: the stage's role is given, the row is written as passed, the log is sent, and the next stage
 * starts. Call it under {@linkcode withOnboardingMemberLock}.
 *
 * @remarks The role is given first. A stage marked as passed is never shown again, so a role Discord refused would
 * be lost for good.
 */
export async function passOnboardingStageLocked(
	member: GuildMember,
	config: OnboardingConfig,
	stage: OnboardingStage,
	verification: OnboardingVerification
): Promise<OnboardingPassResult> {
	const guild = await container.gatewayClient.guilds.fetch(member.guildId);
	const t = await fetchGuildT(guild);
	const user = (member.user ?? (await member.fetchUser())).toJSON();
	if (stage.roleId !== null) {
		const error = await member.roles.add(stage.roleId, t('events/onboarding:reasonPassed', { stage: stage.name })).then(
			() => null,
			(cause: unknown) => describeOnboardingError(t('events/onboarding:actionRole'), cause, false)
		);
		if (error !== null) {
			await sendOnboardingLog(guild.id, config.settings.logChannelId, t, user, {
				kind: 'RoleRefused',
				stage: stage.name,
				roleId: stage.roleId,
				error
			});
			return { kind: 'RoleRefused', error };
		}
	}

	if (!(await resolveOnboardingVerification(container.prisma, verification.id, 'Passed'))) return { kind: 'Stale' };
	await cancelOnboardingTimeLimit(stage, verification);

	await sendOnboardingLog(guild.id, config.settings.logChannelId, t, user, { kind: 'Passed', stage: stage.name, roleId: stage.roleId });
	return { kind: 'Passed', next: await advanceOnboardingLocked(member, config) };
}

/**
 * What failing a member led to:
 * - `Failed`: the failure action was taken, and the row failed.
 * - `Refused`: Discord refused the failure action, so the row still waits and the action is tried again.
 * - `Stale`: the row no longer waited.
 */
export type OnboardingFailResult = 'Failed' | 'Refused' | 'Stale';

/**
 * Fails a member: the stage's failure action is taken as a case of the bot, the row is written as failed, and the log
 * is sent. Call it under {@linkcode withOnboardingMemberLock}, with a row read under it that still waits.
 *
 * @remarks The row fails only once the action is taken. A row that failed is never failed again, so a kick Discord
 * refused would leave the member in the guild for good. When it is refused, the row still waits and a job tries again
 * later; the job itself passes `retry: false`, since it throws to be tried again.
 */
export async function failOnboardingStageLocked(
	guild: Guild,
	config: Pick<OnboardingConfig, 'settings'>,
	stage: OnboardingStage,
	verification: OnboardingVerification,
	reason: OnboardingFailureReason,
	{ retry = true }: { readonly retry?: boolean } = {}
): Promise<OnboardingFailResult> {
	const t = await fetchGuildT(guild);
	const user = await container.gatewayClient.users.fetch(verification.userId);
	const outcome = await takeFailureAction(guild, stage, user, t('events/onboarding:reasonFailed', { stage: stage.name }));
	await sendOnboardingLog(guild.id, config.settings.logChannelId, t, user.toJSON(), { kind: 'Failed', stage: stage.name, reason, outcome });

	if (outcome.kind === 'Refused') {
		if (retry) await scheduleOnboardingJob(verification.id, Date.now() + OnboardingJobRetryDelay);
		return 'Refused';
	}

	if (!(await resolveOnboardingVerification(container.prisma, verification.id, 'Failed'))) {
		container.logger.warn(`[Onboarding] The row ${verification.id} no longer waited once its failure action was taken.`);
		return 'Stale';
	}

	if (reason === 'Attempts') await cancelOnboardingTimeLimit(stage, verification);
	return 'Failed';
}

async function takeFailureAction(
	guild: Guild,
	stage: OnboardingStage,
	user: Awaited<ReturnType<typeof container.gatewayClient.users.fetch>>,
	reason: string
): Promise<OnboardingFailureOutcome> {
	if (stage.failureAction === 'None') return { kind: 'None' };

	// The lock holds the logs of the guild back until the case is made, so the action is not tracked as a second one:
	const unlock = (await getModeration(guild)).createLock();
	try {
		if (stage.failureAction === 'Kick') {
			const entry = await ModerationActions.kick.apply(guild, { user, reason }, { sendDirectMessage: false });
			return { kind: 'Kicked', caseId: entry.id };
		}

		const duration = (stage.failureTimeout ?? 0) * 1000;
		const entry = await ModerationActions.timeout.apply(guild, { user, reason, duration }, { sendDirectMessage: false });
		return { kind: 'TimedOut', caseId: entry.id };
	} catch (error) {
		const t = await fetchGuildT(guild);
		return {
			kind: 'Refused',
			action: stage.failureAction,
			error: describeOnboardingError(t(`events/onboarding:action${stage.failureAction}`), error, false)
		};
	} finally {
		unlock();
	}
}

/**
 * Describes what Discord refused, or that something failed, for the log: Discord's reason is what the moderators can
 * fix, anything else is logged.
 *
 * @param named - Whether the line names the action, when the line of the log does not already.
 */
function describeOnboardingError(action: string, error: unknown, named = true): string {
	const reason = error instanceof DiscordAPIError ? error.message : null;
	if (reason === null) container.logger.error(`[Onboarding] ${action} failed:`, error);
	if (!named) return reason ?? '?';
	return reason === null ? action : `${action}: ${reason}`;
}

/**
 * Counts a wrong answer, or fails the member when it was their last attempt. Call it under
 * {@linkcode withOnboardingMemberLock}.
 *
 * @returns The attempts left, `0` when the member failed, `null` when the row no longer waited.
 */
export async function recordWrongOnboardingAnswerLocked(
	guild: Guild,
	config: OnboardingConfig,
	stage: OnboardingStage,
	verification: OnboardingVerification
): Promise<number | null> {
	const outcome = decideOnboardingAnswer(stage, verification, false);
	if (!(await recordOnboardingAttempt(container.prisma, verification.id, verification.attempts))) return null;
	if (outcome.kind === 'Wrong') return outcome.attemptsLeft;

	const failed = await failOnboardingStageLocked(guild, config, stage, { ...verification, attempts: verification.attempts + 1 }, 'Attempts');
	return failed === 'Stale' ? null : 0;
}

/**
 * What the job of a row found:
 * - `Done`: the member no longer waits, or the stage has no time limit anymore.
 * - `Left`: the member left, joined again, or the stage is gone: the row was marked as left.
 * - `Off`: the module or the stage is off, so nothing was done; the member still waits.
 * - `Later`: the time limit was made longer since; a job is scheduled at the new deadline.
 * - `Failed`: they failed the stage.
 * - `Refused`: Discord refused the failure action; the job throws to be tried again.
 */
export type OnboardingTimeLimitOutcome = 'Done' | 'Left' | 'Off' | 'Later' | 'Failed' | 'Refused';

/**
 * Fails a member whose time limit ran out, or whose failure action was refused, read again from their row under the
 * lock: an old job does nothing to a member who passed, failed, left or joined again.
 *
 * @remarks The configuration is read from the database, not the cache, since the job acts on a member: the stage, its
 * time limit and the switches may have changed since the job was made. The member is read from Discord, since the bot
 * does not see who leaves while it is offline.
 *
 * @param verificationId - The member's row.
 * @param runAt - When the job was scheduled to run, which is part of its ID.
 */
export async function runOnboardingTimeLimit(verificationId: string, runAt: number): Promise<OnboardingTimeLimitOutcome> {
	const { orm } = container.prisma;
	const verification = await fetchOnboardingVerification(orm, verificationId);
	if (verification === null || verification.status !== 'Waiting') return 'Done';

	const { guildId, userId } = verification;
	const guild = await container.gatewayClient.guilds.resolve(guildId);
	if (guild === null) return 'Done';

	return withOnboardingMemberLock(guildId, userId, async () => {
		const current = await fetchOnboardingVerification(orm, verificationId);
		if (current === null || current.status !== 'Waiting') return 'Done';

		const config = await fetchOnboardingConfig(orm, guildId);
		const stage = config.stages.find((entry) => entry.id === current.stageId);
		if (stage === undefined) return leaveOnboardingRow(current.id);

		// A row written before the member's current join is of a stay that ended:
		const member = await fetchOnboardingMember(guildId, userId);
		if (member === null || selectCurrentStay([current], member.joinedTimestamp).length === 0) return leaveOnboardingRow(current.id);

		// What is off acts on nobody. The member is checked again when they press the button, or when the stages are written:
		if (!config.settings.enabled || !stage.enabled) return 'Off';

		const reason = getOnboardingFailureReason(stage, current, Date.now());
		if (reason === null) {
			const deadline = getOnboardingDeadline(stage, current);
			if (deadline === null) return 'Done';
			// A job that ran a little early keeps its ID: the next one runs a millisecond later.
			await scheduleOnboardingJob(current.id, deadline === runAt ? deadline + 1 : deadline);
			return 'Later';
		}

		const result = await failOnboardingStageLocked(guild, config, stage, current, reason, { retry: false });
		return result === 'Stale' ? 'Done' : result;
	});
}

async function leaveOnboardingRow(verificationId: string): Promise<OnboardingTimeLimitOutcome> {
	return (await resolveOnboardingVerification(container.prisma, verificationId, 'Left')) ? 'Left' : 'Done';
}

/**
 * Marks as left every stage a member who left the guild waited on, so their time limit never acts on them, should
 * they join again.
 */
export async function leaveOnboarding(guildId: Snowflake, userId: Snowflake): Promise<number> {
	return withOnboardingMemberLock(guildId, userId, async () => {
		const count = await leaveOnboardingMember(container.prisma, guildId, userId);
		if (count > 0) container.logger.debug(`[Onboarding] ${userId} left ${guildId} in ${count} stages`);
		return count;
	});
}

/**
 * Reads a member of a guild afresh, with their join time and their flags, or `null` when they are not one anymore.
 */
export function fetchOnboardingMember(guildId: Snowflake, userId: Snowflake): Promise<GuildMember | null> {
	return resolveOnErrorCodes(container.gatewayClient.members.fetch(guildId, userId, { force: true }), RESTJSONErrorCodes.UnknownMember);
}
