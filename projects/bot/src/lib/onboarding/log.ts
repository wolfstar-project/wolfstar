import type { OnboardingFailureReason } from '#lib/onboarding/flow';
import { Colors } from '#utils/constants';
import { createLogMessage, type LogMessageOptions } from '#utils/functions';
import { roleMention, userMention } from '@discordjs/formatters';
import { container } from '@wolfstar/http-framework';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import type { Snowflake } from 'discord-api-types/v10';

export const OnboardingEventsRoot = 'events/onboarding';
const Root = OnboardingEventsRoot;

/**
 * What was done to a member who failed a stage.
 */
export type OnboardingFailureOutcome =
	| { readonly kind: 'None' }
	| { readonly kind: 'Kicked'; readonly caseId: number }
	| { readonly kind: 'TimedOut'; readonly caseId: number }
	| { readonly kind: 'Refused'; readonly action: 'Kick' | 'Timeout'; readonly error: string };

/**
 * What a log of the onboarding tells:
 * - `Passed`: the member passed a stage, and got its role.
 * - `RoleRefused`: the member answered right, but Discord refused the role, so the stage is not passed yet.
 * - `Failed`: the member failed a stage.
 */
export type OnboardingLogEntry =
	| { readonly kind: 'Passed'; readonly stage: string; readonly roleId: Snowflake | null }
	| { readonly kind: 'RoleRefused'; readonly stage: string; readonly roleId: Snowflake; readonly error: string }
	| {
			readonly kind: 'Failed';
			readonly stage: string;
			readonly reason: OnboardingFailureReason;
			readonly outcome: OnboardingFailureOutcome;
	  };

/**
 * Builds a log of the onboarding, for its log channel.
 *
 * @param t - The function to translate with, in the language of the guild.
 * @param user - Who the log is about.
 * @param entry - What it tells.
 */
export function renderOnboardingLog(t: TFunction<AnyNamespace>, user: LogMessageOptions['author'], entry: OnboardingLogEntry) {
	const mention = `${userMention(user.id)} (${user.id})`;
	return createLogMessage({
		color: getLogColor(entry),
		author: user,
		content: renderLogLines(t, mention, entry).join('\n'),
		footer: t(`${Root}:logFooter`)
	});
}

function renderLogLines(t: TFunction<AnyNamespace>, mention: string, entry: OnboardingLogEntry): string[] {
	switch (entry.kind) {
		case 'Passed':
			return [
				t(`${Root}:logPassed`, { user: mention, stage: entry.stage }),
				...(entry.roleId === null ? [] : [t(`${Root}:logRoleGiven`, { role: roleMention(entry.roleId) })])
			];
		case 'RoleRefused':
			return [t(`${Root}:logRoleRefused`, { user: mention, stage: entry.stage, role: roleMention(entry.roleId), error: entry.error })];
		case 'Failed':
			return [
				t(entry.reason === 'Attempts' ? `${Root}:logFailedAttempts` : `${Root}:logFailedTimeLimit`, { user: mention, stage: entry.stage }),
				renderFailureOutcome(t, entry.outcome)
			];
	}
}

function renderFailureOutcome(t: TFunction<AnyNamespace>, outcome: OnboardingFailureOutcome): string {
	switch (outcome.kind) {
		case 'None':
			return t(`${Root}:logOutcomeNone`);
		case 'Kicked':
			return t(`${Root}:logOutcomeKicked`, { caseId: outcome.caseId });
		case 'TimedOut':
			return t(`${Root}:logOutcomeTimedOut`, { caseId: outcome.caseId });
		case 'Refused':
			return t(`${Root}:logOutcomeRefused`, { action: t(`${Root}:action${outcome.action}`), error: outcome.error });
	}
}

function getLogColor(entry: OnboardingLogEntry): number {
	if (entry.kind === 'Passed') return Colors.Green;
	if (entry.kind === 'RoleRefused') return Colors.Amber;
	return entry.outcome.kind === 'Refused' ? Colors.Amber : Colors.Red;
}

/**
 * Sends a log of the onboarding to its log channel, when the guild has one. A log that cannot be sent is only logged:
 * the panel checks the channel when it is set, and says when a stage is not ready.
 */
export async function sendOnboardingLog(
	guildId: Snowflake,
	logChannelId: Snowflake | null,
	t: TFunction<AnyNamespace>,
	user: LogMessageOptions['author'],
	entry: OnboardingLogEntry
): Promise<void> {
	if (logChannelId === null) return;

	try {
		await container.gatewayClient.api.channels.createMessage(logChannelId, renderOnboardingLog(t, user, entry));
	} catch (error) {
		container.logger.warn(`[Onboarding] Could not send a log of ${guildId} to ${logChannelId}:`, error);
	}
}
