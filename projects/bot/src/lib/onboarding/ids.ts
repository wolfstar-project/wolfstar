import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The name of the interaction handler of the panel, `/settings onboarding`, which is also the first part of its IDs.
 */
export const OnboardingPanelHandlerName = 'onboarding';

/**
 * The name of the interaction handler of the members' side: the button of the verification message and the
 * challenges.
 */
export const OnboardingVerifyHandlerName = 'onboardingVerify';

/**
 * What a component of the panel does. Every one carries the revision the panel showed, which a write is made with:
 * - `home`: shows the summary again, read anew (`Reload` after a conflict too).
 * - `toggle`: turns the module on or off (`extra` holds `on` or `off`, what the panel offered).
 * - `create`, `createSubmit`: the modal of a new stage, and its submission.
 * - `stage`: the select menu that opens a stage.
 * - `edit`, `editSubmit`: the modal of the texts of a stage, and its submission (`extra` holds the challenge it sets).
 * - `trigger`, `challenge`, `failure`, `role`: the select menus of a stage.
 * - `roleClear`: the stage gives no role.
 * - `up`, `down`, `switch`, `delete`: moves, switches or deletes a stage.
 * - `log`, `logClear`: the log channel.
 * - `post`: posts the verification message in the picked channel, or moves it there.
 */
export const OnboardingPanelVerbs = [
	'home',
	'toggle',
	'create',
	'createSubmit',
	'stage',
	'edit',
	'editSubmit',
	'trigger',
	'challenge',
	'failure',
	'role',
	'roleClear',
	'up',
	'down',
	'switch',
	'delete',
	'log',
	'logClear',
	'post'
] as const;

export type OnboardingPanelVerb = (typeof OnboardingPanelVerbs)[number];

export interface OnboardingPanelAction {
	/** The administrator who opened the panel, the only one that can use it. */
	readonly ownerId: Snowflake;
	readonly verb: OnboardingPanelVerb;
	/** The revision of the onboarding the panel showed. */
	readonly revision: number;
	/** The stage the component is of, `''` for none. */
	readonly stageId: string;
	/** What else the verb needs, `''` for nothing. */
	readonly extra: string;
}

const PanelVerbs = new Set<string>(OnboardingPanelVerbs);

/**
 * Builds the custom ID of a component of the panel, `onboarding.<ownerId>.<verb>:<revision>:<stageId>:<extra>`.
 */
export function encodeOnboardingPanelId(action: OnboardingPanelAction): string {
	return encodeCustomId(OnboardingPanelHandlerName, action.ownerId, `${action.verb}:${action.revision}:${action.stageId}:${action.extra}`);
}

/**
 * Reads what {@linkcode encodeOnboardingPanelId} wrote.
 *
 * @returns The action, `null` when the custom ID is not one of the panel.
 */
export function decodeOnboardingPanelId(content: unknown): OnboardingPanelAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null) return null;

	const [verb, revision, stageId = '', extra = ''] = decoded.action.split(':');
	if (verb === undefined || !PanelVerbs.has(verb) || revision === undefined) return null;

	const revisionNumber = Number(revision);
	if (!Number.isSafeInteger(revisionNumber) || revisionNumber < 0) return null;

	return { ownerId: decoded.sessionId, verb: verb as OnboardingPanelVerb, revision: revisionNumber, stageId, extra };
}

/**
 * The `extra` of a `toggle` button: the state the module gets when it is pressed.
 *
 * @remarks The button sets what the panel showed it would, and does not flip what is stored: a panel shown before
 * a write of the dashboard, or a click sent twice, would undo it. The switch is not covered by the revision, since the
 * dashboard writes it with the other settings.
 */
export function formatOnboardingToggleTarget(enabled: boolean): string {
	return enabled ? 'on' : 'off';
}

/**
 * Reads what {@linkcode formatOnboardingToggleTarget} wrote.
 *
 * @returns Whether the module is turned on, `null` when the button names no state.
 */
export function parseOnboardingToggleTarget(extra: string): boolean | null {
	if (extra === 'on') return true;
	return extra === 'off' ? false : null;
}

/**
 * What a component of the members' side does:
 * - `start`: the button of the verification message (`id` is the guild).
 * - `emoji`: an emoji of an `Emoji` stage (`id` is the member's row; `attempts` and `index` say which button).
 * - `ask`: opens the modal of a `Question` stage again (`id` is the row).
 * - `answer`: the submission of that modal (`id` is the row).
 */
export type OnboardingVerifyAction =
	| { readonly verb: 'start'; readonly guildId: Snowflake }
	| { readonly verb: 'emoji'; readonly verificationId: string; readonly attempts: number; readonly index: number }
	| { readonly verb: 'ask' | 'answer'; readonly verificationId: string; readonly attempts: number };

/**
 * Builds the custom ID of a component of the members' side, `onboardingVerify.<id>.<verb>:<attempts>:<index>`.
 *
 * @remarks The attempts the row had when the component was shown are in the ID: a click on an older one is refused, so
 * a member cannot answer the same challenge twice.
 */
export function encodeOnboardingVerifyId(action: OnboardingVerifyAction): string {
	switch (action.verb) {
		case 'start':
			return encodeCustomId(OnboardingVerifyHandlerName, action.guildId, 'start');
		case 'emoji':
			return encodeCustomId(OnboardingVerifyHandlerName, action.verificationId, `emoji:${action.attempts}:${action.index}`);
		case 'ask':
		case 'answer':
			return encodeCustomId(OnboardingVerifyHandlerName, action.verificationId, `${action.verb}:${action.attempts}`);
	}
}

/**
 * Reads what {@linkcode encodeOnboardingVerifyId} wrote.
 */
export function decodeOnboardingVerifyId(content: unknown): OnboardingVerifyAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null) return null;

	const [verb, attempts, index] = decoded.action.split(':');
	if (verb === 'start') return { verb, guildId: decoded.sessionId };

	const attemptsNumber = Number(attempts);
	if (!Number.isSafeInteger(attemptsNumber) || attemptsNumber < 0) return null;
	if (verb === 'ask' || verb === 'answer') return { verb, verificationId: decoded.sessionId, attempts: attemptsNumber };

	const indexNumber = Number(index);
	if (verb !== 'emoji' || !Number.isSafeInteger(indexNumber) || indexNumber < 0) return null;
	return { verb, verificationId: decoded.sessionId, attempts: attemptsNumber, index: indexNumber };
}
