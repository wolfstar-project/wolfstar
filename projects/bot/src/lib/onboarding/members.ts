import { resolveOnErrorCodes } from '#common';
import { ModerationActions } from '#lib/moderation/actions/index';
import { fetchGuildT } from '#lib/moderation/common';
import { getModeration } from '#utils/functions';
import {
	decideOnboardingAnswer,
	getOnboardingDeadline,
	getOnboardingStep,
	isOnboardingExpired,
	selectCurrentStay,
	type OnboardingStep
} from '#lib/onboarding/flow';
import { sendOnboardingLog, type OnboardingFailureOutcome, type OnboardingFailureReason } from '#lib/onboarding/log';
import { readOnboardingConfig, withOnboardingMemberLock } from '#lib/onboarding/store';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import { GuildMemberFlags, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import {
	createOnboardingVerification,
	fetchOnboardingStages,
	fetchOnboardingVerification,
	fetchOnboardingVerifications,
	leaveOnboardingMember,
	recordOnboardingAttempt,
	resolveOnboardingVerification,
	type OnboardingConfig,
	type OnboardingStage,
	type OnboardingVerification
} from 'wolfstar-database';

/**
 * The ID of the job that fails a member whose time limit ran out.
 */
export function getOnboardingTimeLimitTaskId(verificationId: string) {
	return `onboarding-${verificationId}`;
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
 */
export async function startOnboardingStage(guildId: Snowflake, userId: Snowflake, stage: OnboardingStage): Promise<OnboardingVerification> {
	const verification = await createOnboardingVerification(container.prisma, { guildId, userId, stage });
	const deadline = getOnboardingDeadline(stage, verification);
	if (deadline !== null) await scheduleOnboardingTimeLimit(verification.id, deadline - Date.now());
	return verification;
}

async function scheduleOnboardingTimeLimit(verificationId: string, delay: number) {
	await container.tasks.create(
		{ name: 'onboardingTimeLimit', payload: { verificationId } },
		{
			repeated: false,
			delay: Math.max(delay, 0),
			customJobOptions: { jobId: getOnboardingTimeLimitTaskId(verificationId), removeOnComplete: true, removeOnFail: true }
		}
	);
}

/**
 * The time limit of a row whose member no longer waits does nothing anyway, so a job that cannot be removed only runs
 * for nothing: the failure is logged and not thrown.
 */
async function cancelOnboardingTimeLimit(verificationId: string) {
	try {
		await container.tasks.delete(getOnboardingTimeLimitTaskId(verificationId));
	} catch (error) {
		container.logger.debug(`[Onboarding] Could not remove the time limit of the row ${verificationId}:`, error);
	}
}

/**
 * What a member passing a stage led to: whether the row was still waiting, and where they are now.
 */
export interface OnboardingPassResult {
	readonly passed: boolean;
	readonly next: OnboardingStep | null;
}

/**
 * Passes a member: the row is written as passed, the stage's role is given, the log is sent, and the next stage
 * starts. Call it under {@linkcode withOnboardingMemberLock}.
 */
export async function passOnboardingStageLocked(
	member: GuildMember,
	config: OnboardingConfig,
	stage: OnboardingStage,
	verification: OnboardingVerification
): Promise<OnboardingPassResult> {
	if (!(await resolveOnboardingVerification(container.prisma, verification.id, 'Passed'))) return { passed: false, next: null };
	await cancelOnboardingTimeLimit(verification.id);

	const guild = await container.gatewayClient.guilds.fetch(member.guildId);
	const t = await fetchGuildT(guild);
	const errors: string[] = [];
	if (stage.roleId !== null) {
		try {
			await member.roles.add(stage.roleId, t('events/onboarding:reasonPassed', { stage: stage.name }));
		} catch (error) {
			errors.push(describeOnboardingError(t('events/onboarding:actionRole'), error));
		}
	}

	const user = (member.user ?? (await member.fetchUser())).toJSON();
	await sendOnboardingLog(guild.id, config.settings.logChannelId, t, user, { kind: 'Passed', stage: stage.name, roleId: stage.roleId, errors });
	return { passed: true, next: await advanceOnboardingLocked(member, config) };
}

/**
 * Fails a member: the row is written as failed, the stage's failure action is taken as a case of the bot, and the log
 * is sent. Call it under {@linkcode withOnboardingMemberLock}.
 *
 * @returns Whether the row was still waiting.
 */
export async function failOnboardingStageLocked(
	guild: Guild,
	config: Pick<OnboardingConfig, 'settings'>,
	stage: OnboardingStage,
	verification: OnboardingVerification,
	reason: OnboardingFailureReason
): Promise<boolean> {
	if (!(await resolveOnboardingVerification(container.prisma, verification.id, 'Failed'))) return false;
	if (reason === 'Attempts') await cancelOnboardingTimeLimit(verification.id);

	const t = await fetchGuildT(guild);
	const user = await container.gatewayClient.users.fetch(verification.userId);
	const outcome = await takeFailureAction(guild, stage, user, t('events/onboarding:reasonFailed', { stage: stage.name }));
	await sendOnboardingLog(guild.id, config.settings.logChannelId, t, user.toJSON(), { kind: 'Failed', stage: stage.name, reason, outcome });
	return true;
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

	return (await failOnboardingStageLocked(guild, config, stage, { ...verification, attempts: verification.attempts + 1 }, 'Attempts')) ? 0 : null;
}

/**
 * What the time limit of a row found:
 * - `Done`: the member no longer waits, or the stage is gone.
 * - `Failed`: they failed the stage.
 * - `Later`: the time limit was made longer since; the job is scheduled again.
 */
export type OnboardingTimeLimitOutcome = 'Done' | 'Failed' | 'Later';

/**
 * Fails a member whose time limit ran out, read again from their row: an old job does nothing to a member who passed,
 * failed, left or joined again.
 */
export async function runOnboardingTimeLimit(verificationId: string): Promise<OnboardingTimeLimitOutcome> {
	const verification = await fetchOnboardingVerification(container.prisma.orm, verificationId);
	if (verification === null || verification.status !== 'Waiting' || verification.stageId === null) return 'Done';

	const { guildId, userId } = verification;
	const guild = await container.gatewayClient.guilds.resolve(guildId);
	if (guild === null) return 'Done';

	return withOnboardingMemberLock(guildId, userId, async () => {
		const current = await fetchOnboardingVerification(container.prisma.orm, verificationId);
		if (current === null || current.status !== 'Waiting') return 'Done';

		// The stage as it is now: its time limit may have changed since the job was made.
		const stage = (await fetchOnboardingStages(container.prisma.orm, guildId)).find((entry) => entry.id === current.stageId);
		if (stage === undefined) return 'Done';

		if (!isOnboardingExpired(stage, current, Date.now())) {
			const deadline = getOnboardingDeadline(stage, current);
			if (deadline === null) return 'Done';
			await scheduleOnboardingTimeLimit(current.id, deadline - Date.now());
			return 'Later';
		}

		const config = await readOnboardingConfig(guildId);
		return (await failOnboardingStageLocked(guild, config, stage, current, 'TimeLimit')) ? 'Failed' : 'Done';
	});
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
