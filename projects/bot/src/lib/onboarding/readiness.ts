import type { OnboardingStage } from 'wolfstar-database';

/**
 * Whether the website's `/verify` page serves the `Captcha` challenge of the onboarding. Until it does, the panel does
 * not offer it, and a stage that has it is blocked.
 */
export const OnboardingCaptchaAvailable = false;

/**
 * What keeps a stage from working. The dashboard shows the same, with the same names.
 */
export type OnboardingStageBlocker =
	| 'NoCommunity'
	| 'NativeOnboardingOff'
	| 'NoMessage'
	| 'RoleMissing'
	| 'RoleManaged'
	| 'RoleTooHigh'
	| 'MissingManageRoles'
	| 'MissingKickMembers'
	| 'MissingModerateMembers'
	| 'CaptchaUnavailable';

/**
 * A role of the guild, as the checks read it.
 */
export interface OnboardingRoleInfo {
	readonly managed: boolean;
	/** Whether it is below the bot's highest role, a tie broken by the ID as Discord does. */
	readonly belowBot: boolean;
}

/**
 * What the readiness of the stages of a guild is checked against, read from Discord when it is shown.
 */
export interface OnboardingReadinessContext {
	/** Whether the guild has the `COMMUNITY` feature. */
	readonly community: boolean;
	/** Whether Discord's onboarding of the guild is on (`GET /guilds/:id/onboarding`). */
	readonly nativeOnboardingEnabled: boolean;
	/** Whether the verification message is posted and still there. */
	readonly hasMessage: boolean;
	readonly roles: ReadonlyMap<string, OnboardingRoleInfo>;
	readonly permissions: { readonly manageRoles: boolean; readonly kickMembers: boolean; readonly moderateMembers: boolean };
	readonly captchaAvailable: boolean;
}

/**
 * Why a role cannot be the one a stage gives, `null` when it can.
 */
export function getOnboardingRoleProblem(
	roleId: string,
	roles: ReadonlyMap<string, OnboardingRoleInfo>
): Extract<OnboardingStageBlocker, `Role${string}`> | null {
	const role = roles.get(roleId);
	if (role === undefined) return 'RoleMissing';
	if (role.managed) return 'RoleManaged';
	return role.belowBot ? null : 'RoleTooHigh';
}

/**
 * Lists what keeps a stage from working, none when it is ready.
 */
export function getOnboardingStageBlockers(stage: OnboardingStage, context: OnboardingReadinessContext): OnboardingStageBlocker[] {
	const blockers: OnboardingStageBlocker[] = [];
	if (stage.trigger === 'NativeOnboarding') {
		if (!context.community) blockers.push('NoCommunity');
		if (!context.nativeOnboardingEnabled) blockers.push('NativeOnboardingOff');
	}

	if (!context.hasMessage) blockers.push('NoMessage');

	if (stage.roleId !== null) {
		const problem = getOnboardingRoleProblem(stage.roleId, context.roles);
		if (problem !== null) blockers.push(problem);
		if (!context.permissions.manageRoles) blockers.push('MissingManageRoles');
	}

	if (stage.failureAction === 'Kick' && !context.permissions.kickMembers) blockers.push('MissingKickMembers');
	if (stage.failureAction === 'Timeout' && !context.permissions.moderateMembers) blockers.push('MissingModerateMembers');
	if (stage.challenge === 'Captcha' && !context.captchaAvailable) blockers.push('CaptchaUnavailable');
	return blockers;
}
