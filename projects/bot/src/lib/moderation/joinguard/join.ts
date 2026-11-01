import { fetchUserReportEnabled } from '#lib/database';
import { ModerationActions } from '#lib/moderation/actions/index';
import { getAppealUrl, shouldLinkAppeal } from '#lib/moderation/appeals';
import { fetchGuildT } from '#lib/moderation/common';
import { hasSameJoinGuardRoles, scheduleJoinGuardTimeout } from '#lib/moderation/joinguard/checkpoint';
import {
	isJoinGuardAllowed,
	matchesJoinGuardRule,
	readJoinGuardSignals,
	type JoinGuardSignals,
	type JoinGuardUser
} from '#lib/moderation/joinguard/conditions';
import {
	describeJoinGuardError,
	describeJoinGuardMissingPermissions,
	describeJoinGuardRoleProblem,
	recordSharedBan,
	sendJoinGuardLog
} from '#lib/moderation/joinguard/log';
import {
	getJoinGuardRoleProblem,
	getJoinGuardTargetProblem,
	getMissingJoinGuardChannelPermissions,
	getMissingJoinGuardPermissions
} from '#lib/moderation/joinguard/permissions';
import { planJoinGuardActions, type JoinGuardPlan } from '#lib/moderation/joinguard/plan';
import {
	getJoinGuardVerifyUrl,
	renderJoinGuardAlert,
	renderJoinGuardDirectMessage,
	type JoinGuardLogEntry,
	type JoinGuardOutcome
} from '#lib/moderation/joinguard/render';
import { readJoinGuardConfig, withJoinGuardMemberLock } from '#lib/moderation/joinguard/store';
import { getModeration, getStickyRoles } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { channelMention, roleMention } from '@discordjs/formatters';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import type { Guild, GuildMember, User } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import { RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import { createJoinGuardCheckpoint, deleteJoinGuardCheckpoint, type JoinGuardSettings } from 'wolfstar-database';

const Root = 'events/join-guard';

/**
 * Reads what the join guard looks at of a user.
 */
function toJoinGuardUser(user: User): JoinGuardUser {
	return {
		id: user.id,
		username: user.username,
		globalName: user.globalName ?? null,
		avatar: user.avatar ?? null,
		bot: user.bot ?? false,
		flags: Number(user.flags.bitField)
	};
}

/**
 * Checks a member who joins a guild against the rules of its join guard, and does what the rules they match say.
 *
 * @remarks
 *
 * Nothing is done while the guard is off, nor to a member of the allow list: an allowed user, or one who holds an
 * allowed role, the sticky roles they get back included. Every rule the member matches runs, combined once
 * ({@linkcode planJoinGuardActions}), and what was done is reported to the log of the guard.
 *
 * @param member - The member who joined.
 * @param now - When they joined, in milliseconds.
 */
export async function guardJoiningMember(member: GuildMember, now = Date.now()): Promise<JoinGuardPlan | null> {
	const { guildId } = member;
	const { settings, rules } = await readJoinGuardConfig(guildId);
	if (!settings.joinGuardEnabled || rules.length === 0) {
		container.logger.debug(`[JoinGuard] Member of ${guildId} not checked: enabled ${settings.joinGuardEnabled}, ${rules.length} rules`);
		return null;
	}

	const user = member.user ?? (await member.fetchUser());
	const roleIds = [...member.roles.ids, ...(await (await getStickyRoles(member)).fetch(user.id))];
	if (isJoinGuardAllowed(settings, user.id, roleIds)) {
		container.logger.debug(`[JoinGuard] ${user.id} of ${guildId} let through: allowed`);
		return null;
	}

	const signals = readJoinGuardSignals(toJoinGuardUser(user));
	const matched = rules.filter((rule) => matchesJoinGuardRule(rule, signals, now));
	container.logger.debug(`[JoinGuard] ${user.id} of ${guildId} matched ${matched.length} of ${rules.length} rules`);
	if (matched.length === 0) return null;

	const plan = planJoinGuardActions(matched, settings);
	container.logger.debug(
		`[JoinGuard] ${user.id} of ${guildId}: stopped with ${plan.stop.kind}, rules ${plan.rules.map((rule) => rule.id).join(', ')}`
	);
	const guild = await member.fetchGuild();
	await withJoinGuardMemberLock(guildId, user.id, () => runJoinGuardPlan({ guild, member, user, settings, plan, signals, now }));
	return plan;
}

interface JoinGuardRun {
	readonly guild: Guild;
	readonly member: GuildMember;
	readonly user: User;
	readonly settings: JoinGuardSettings;
	readonly plan: JoinGuardPlan;
	readonly signals: JoinGuardSignals;
	readonly now: number;
}

async function runJoinGuardPlan(run: JoinGuardRun) {
	const { guild, user, settings, plan } = run;
	const t = await fetchGuildT(guild);
	const errors: string[] = [];

	let outcome: JoinGuardOutcome = { kind: 'None' };
	let directMessage: Extract<JoinGuardLogEntry, { kind: 'Stopped' }>['directMessage'] = 'None';
	const tell = async (told: JoinGuardOutcome['kind']) => {
		if (plan.directMessage) directMessage = await sendDirectMessage(t, run, told);
	};

	const { stop } = plan;
	if (stop.kind === 'Ban' || stop.kind === 'Kick') {
		outcome = await removeMember(t, run, stop.kind, tell, errors);
	} else if (stop.kind === 'Checkpoint') {
		outcome = await sendToCheckpoint(t, run, errors);
		await tell(outcome.kind);
	} else {
		await tell('None');
	}

	const removed = outcome.kind === 'Banned' || outcome.kind === 'Kicked';
	const roles = removed ? [] : await giveRoles(t, run, errors);
	const alerts = await sendAlerts(t, run, errors);
	container.logger.debug(
		`[JoinGuard] ${user.id} of ${guild.id}: outcome ${outcome.kind}, direct message ${directMessage}, ${errors.length} errors`
	);

	sendJoinGuardLog(guild, settings.joinGuardLogChannel, user.toJSON(), {
		kind: 'Stopped',
		rules: plan.rules.map((rule) => rule.name),
		signals: run.signals,
		outcome,
		checkpointOff: plan.checkpointOff,
		roles,
		alerts,
		directMessage,
		errors
	});
}

/**
 * Bans or kicks a member a rule stopped, as a case of the bot with the names of the rules in its reason. The direct
 * message is sent first, since the bot shares no server with the member afterwards, and only when the bot can act:
 * the one of the case is not sent, the member gets one in total.
 */
async function removeMember(
	t: TFunction<AnyNamespace>,
	run: JoinGuardRun,
	kind: 'Ban' | 'Kick',
	tell: (outcome: JoinGuardOutcome['kind']) => Promise<void>,
	errors: string[]
): Promise<JoinGuardOutcome> {
	const { guild, user, plan } = run;
	const missing = await getMissingJoinGuardPermissions(guild.id, [kind === 'Ban' ? 'ban' : 'kick']);
	if (missing.length > 0) {
		errors.push(describeJoinGuardMissingPermissions(t, kind, missing));
		await tell('None');
		return { kind: 'None' };
	}

	// The member is told what is done to them only when the bot can do it: the owner, and a member at or above the bot,
	// are refused before anything is sent.
	const problem = await getJoinGuardTargetProblem(t, guild, user.id, container.gatewayClient.user!.id);
	if (problem !== null) {
		errors.push(t(`${Root}:errorTarget`, { action: t(`${Root}:action${kind}`), reason: problem }));
		await tell('None');
		return { kind: 'None' };
	}

	await tell(kind === 'Ban' ? 'Banned' : 'Kicked');

	const reason = t(`${Root}:caseReason`, { rules: plan.rules.map((rule) => rule.name) });
	let caseId: number;
	// The lock holds the logs of the guild back until the case is made, so the action is not tracked as a second one:
	const unlock = (await getModeration(guild)).createLock();
	try {
		const entry =
			kind === 'Ban'
				? await ModerationActions.ban.apply(guild, { user, reason }, { sendDirectMessage: false, context: 0 })
				: await ModerationActions.kick.apply(guild, { user, reason }, { sendDirectMessage: false });
		caseId = entry.id;
	} catch (error) {
		errors.push(describeJoinGuardError(t, kind, error));
		return { kind: 'None' };
	} finally {
		unlock();
	}

	if (kind === 'Ban') await recordSharedBan({ guildId: guild.id, userId: user.id, caseId, source: 'JoinGuard' });
	await recordStop(run, kind === 'Ban' ? 'Banned' : 'Kicked', caseId, null, errors);
	return kind === 'Ban' ? { kind: 'Banned', caseId } : { kind: 'Kicked', caseId };
}

/**
 * Sends a member a rule stopped to the checkpoint: they get the pending role, wait in the queue and are kicked when the
 * time to verify runs out.
 *
 * @remarks It is done whole or not at all. A member the pending role cannot be given to does not wait (the timeout
 * would read the missing role as let in by hand), and a member whose row or timeout cannot be written gets the role
 * taken back and their row deleted: a member never waits with nothing to let them in or kick them.
 */
async function sendToCheckpoint(t: TFunction<AnyNamespace>, run: JoinGuardRun, errors: string[]): Promise<JoinGuardOutcome> {
	const { guild, member, settings, now } = run;
	const fail = (reason: string): JoinGuardOutcome => {
		errors.push(t(`${Root}:errorCheckpointSetup`, { reason }));
		return { kind: 'None' };
	};

	if (hasSameJoinGuardRoles(settings)) return fail(t(`${Root}:errorSameRoles`));

	const pending = settings.joinGuardPendingRole;
	if (pending !== null) {
		const problem = await getJoinGuardRoleProblem(guild.id, pending);
		if (problem !== null) return fail(t(`${Root}:errorRole`, { role: roleMention(pending), reason: describeJoinGuardRoleProblem(t, problem) }));

		const refused = await member.roles.add(pending, t(`${Root}:pendingRoleReason`)).then(
			() => null,
			(error: unknown) => error
		);
		if (refused !== null) return fail(describeJoinGuardError(t, 'Checkpoint', refused));
	}

	const timeout = settings.joinGuardCheckpointTimeout;
	const expiresAt = timeout === 0 ? null : now + timeout * 1000;
	const checkpointId = await recordStop(run, 'Waiting', null, expiresAt, errors);
	if (checkpointId === null) {
		await takeBackPendingRole(t, member, pending);
		return { kind: 'None' };
	}

	if (expiresAt !== null) {
		const unscheduled = await scheduleJoinGuardTimeout(checkpointId, timeout).then(
			() => null,
			(error: unknown) => error
		);
		if (unscheduled !== null) {
			await deleteJoinGuardCheckpoint(container.prisma, checkpointId).catch((error: unknown) =>
				container.logger.error(`[JoinGuard] Could not delete the row ${checkpointId} of a checkpoint that was not set up:`, error)
			);
			await takeBackPendingRole(t, member, pending);
			return fail(describeJoinGuardError(t, 'Timeout', unscheduled));
		}
	}

	return { kind: 'Checkpoint', expiresAt };
}

async function takeBackPendingRole(t: TFunction<AnyNamespace>, member: GuildMember, roleId: Snowflake | null) {
	if (roleId === null) return;

	try {
		await member.roles.remove(roleId, t(`${Root}:pendingRoleReason`));
	} catch (error) {
		container.logger.error(`[JoinGuard] Could not take back the pending role of ${member.user?.id ?? 'a member'}:`, error);
	}
}

/**
 * Records a member a rule stopped in the queue, with the rule that decided it and what it saw.
 *
 * @returns The ID of the row, `null` when it could not be written.
 */
async function recordStop(
	run: JoinGuardRun,
	status: 'Waiting' | 'Kicked' | 'Banned',
	caseId: number | null,
	expiresAt: number | null,
	errors: string[]
): Promise<string | null> {
	const { stop } = run.plan;
	if (stop.kind === 'None') return null;

	try {
		const row = await createJoinGuardCheckpoint(container.prisma, run.guild.id, {
			userId: run.user.id,
			ruleId: stop.rule.id,
			ruleName: stop.rule.name,
			status,
			caseId,
			accountCreatedAt: run.signals.accountCreatedAt,
			defaultAvatar: run.signals.defaultAvatar,
			generatedName: run.signals.generatedName,
			expiresAt
		});
		return row.id;
	} catch (error) {
		errors.push(describeJoinGuardError(await fetchGuildT(run.guild), 'Checkpoint', error));
		return null;
	}
}

/**
 * Gives a member the roles of the rules they matched.
 *
 * @returns The roles given.
 */
async function giveRoles(t: TFunction<AnyNamespace>, run: JoinGuardRun, errors: string[]): Promise<Snowflake[]> {
	const given: Snowflake[] = [];
	for (const roleId of run.plan.roles) {
		const problem = await getJoinGuardRoleProblem(run.guild.id, roleId);
		if (problem !== null) {
			errors.push(t(`${Root}:errorRole`, { role: roleMention(roleId), reason: describeJoinGuardRoleProblem(t, problem) }));
			continue;
		}

		const rule = run.plan.rules.find((entry) => entry.roleId === roleId)!;
		try {
			await run.member.roles.add(roleId, t(`${Root}:ruleRoleReason`, { rule: rule.name }));
			given.push(roleId);
		} catch (error) {
			errors.push(describeJoinGuardError(t, 'Roles', error));
		}
	}

	return given;
}

/**
 * Alerts the moderators in the channels of the rules a member matched.
 *
 * @returns The channels alerted.
 */
async function sendAlerts(t: TFunction<AnyNamespace>, run: JoinGuardRun, errors: string[]): Promise<Snowflake[]> {
	const sent: Snowflake[] = [];
	for (const alert of run.plan.alerts) {
		const channel = channelMention(alert.channelId);
		const missing = await getMissingJoinGuardChannelPermissions(run.guild.id, alert.channelId);
		if (missing === null) {
			errors.push(t(`${Root}:errorAlert`, { channel, reason: t(`${Root}:channelProblemUnknown`) }));
			continue;
		}
		if (missing.length > 0) {
			errors.push(t(`${Root}:errorAlert`, { channel, reason: t(`${Root}:channelProblemMissing`, { missing }) }));
			continue;
		}

		try {
			await container.gatewayClient.api.channels.createMessage(alert.channelId, renderJoinGuardAlert(t, run.user.id, alert.rules, run.signals));
			sent.push(alert.channelId);
		} catch (error) {
			if (!(error instanceof DiscordAPIError)) container.logger.error(`[JoinGuard] Could not alert in ${alert.channelId}:`, error);
			errors.push(
				t(`${Root}:errorAlert`, { channel, reason: error instanceof DiscordAPIError ? error.message : t(`${Root}:channelProblemUnknown`) })
			);
		}
	}

	return sent;
}

/**
 * Sends the one direct message of the guard. A member sent to the checkpoint always gets it, it has the link they
 * need; the others not when they turned the moderation direct messages off.
 */
async function sendDirectMessage(
	t: TFunction<AnyNamespace>,
	run: JoinGuardRun,
	outcome: JoinGuardOutcome['kind']
): Promise<'Sent' | 'Undelivered' | 'None'> {
	const { guild, user, settings } = run;
	if (outcome !== 'Checkpoint' && !(await fetchUserReportEnabled(user.id))) return 'None';

	const content = renderJoinGuardDirectMessage(t, {
		server: guild.name,
		content: settings.joinGuardDirectMessageContent,
		outcome,
		verifyUrl: getJoinGuardVerifyUrl(guild.id),
		appealUrl: outcome === 'Banned' && (await shouldLinkAppeal(guild.id, TypeVariation.Ban, false)) ? getAppealUrl(guild.id) : null
	});
	try {
		await user.send({ content });
		return 'Sent';
	} catch (error) {
		// A member with closed direct messages is what the log says, anything else is logged:
		if (!(error instanceof DiscordAPIError) || error.code !== RESTJSONErrorCodes.CannotSendMessagesToThisUser) {
			container.logger.error(`[JoinGuard] Could not send the direct message of ${user.id}:`, error);
		}
		return 'Undelivered';
	}
}
