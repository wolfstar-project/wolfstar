import type { Snowflake } from 'discord-api-types/v10';
import type { JoinGuardRule, JoinGuardSettings } from 'wolfstar-database';

/**
 * What stops a member, from the strongest: a ban, a kick, the checkpoint, or nothing. It carries the rule that decided
 * it, which the queue of the dashboard and the reason of the case name.
 */
export type JoinGuardStop =
	| { readonly kind: 'Ban'; readonly rule: JoinGuardRule }
	| { readonly kind: 'Kick'; readonly rule: JoinGuardRule }
	| { readonly kind: 'Checkpoint'; readonly rule: JoinGuardRule }
	| { readonly kind: 'None' };

/**
 * An alert to the moderators, in the channel of one or more rules.
 */
export interface JoinGuardAlert {
	readonly channelId: Snowflake;
	readonly rules: readonly string[];
}

/**
 * What the join guard does to a member, combined once from every rule they match.
 */
export interface JoinGuardPlan {
	/** The rules the member matched, oldest first. */
	readonly rules: readonly JoinGuardRule[];
	readonly stop: JoinGuardStop;
	/** The roles to give, none when the member is removed. */
	readonly roles: readonly Snowflake[];
	readonly alerts: readonly JoinGuardAlert[];
	/** Whether the member gets the one direct message of the guard. */
	readonly directMessage: boolean;
	/** A rule asked for the checkpoint, which the guild has off: the member was not sent there. */
	readonly checkpointOff: boolean;
}

/**
 * Combines the actions of the rules a member matched.
 *
 * @remarks
 *
 * - A ban beats a kick, which beats the checkpoint: a member who is removed is not also sent to the checkpoint, and is
 *   given no role. The first rule (the oldest) with the strongest stop decides it.
 * - The checkpoint is only used when the guild has it on.
 * - The roles and the alerts are of every rule: a role is given once, and a channel gets one alert naming its rules.
 * - The member gets one direct message: when a rule asks for it, or when they are stopped and the guild tells who it
 *   stops (`joinGuardDirectMessage`).
 *
 * @param rules - The rules the member matched.
 * @param settings - The settings of the guard.
 */
export function planJoinGuardActions(
	rules: readonly JoinGuardRule[],
	settings: Pick<JoinGuardSettings, 'joinGuardCheckpoint' | 'joinGuardDirectMessage'>
): JoinGuardPlan {
	const ban = rules.find((rule) => rule.hardAction === 'Ban');
	const kick = rules.find((rule) => rule.hardAction === 'Kick');
	const checkpoint = rules.find((rule) => rule.sendToCheckpoint);

	const stop: JoinGuardStop = ban
		? { kind: 'Ban', rule: ban }
		: kick
			? { kind: 'Kick', rule: kick }
			: checkpoint && settings.joinGuardCheckpoint
				? { kind: 'Checkpoint', rule: checkpoint }
				: { kind: 'None' };
	const removed = stop.kind === 'Ban' || stop.kind === 'Kick';

	const alerts = new Map<Snowflake, string[]>();
	for (const rule of rules) {
		if (rule.alertChannelId === null) continue;
		alerts.set(rule.alertChannelId, [...(alerts.get(rule.alertChannelId) ?? []), rule.name]);
	}

	return {
		rules,
		stop,
		roles: removed ? [] : [...new Set(rules.flatMap((rule) => (rule.roleId === null ? [] : [rule.roleId])))],
		alerts: [...alerts].map(([channelId, names]) => ({ channelId, rules: names })),
		directMessage: rules.some((rule) => rule.directMessage) || (stop.kind !== 'None' && settings.joinGuardDirectMessage),
		checkpointOff: checkpoint !== undefined && !settings.joinGuardCheckpoint && !removed
	};
}
