import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The name of the interaction handler of the auto-moderation menu, which is also the first part of its custom IDs.
 */
export const AutoModerationMenuHandlerName = 'automod';

/**
 * The parts a rule is configured in, which the section select menu switches between:
 *
 * - `options`: what the rule looks for, its list or its numbers.
 * - `response`: what it does to a message and to its author.
 * - `exempt`: the roles and the channels it leaves alone.
 */
export const AutoModerationMenuSections = ['options', 'response', 'exempt'] as const;
export type AutoModerationMenuSection = (typeof AutoModerationMenuSections)[number];

/**
 * What a component of the auto-moderation menu does:
 *
 * - `list`: shows the rules of the server.
 * - `setting`: changes a setting of the auto-moderation of the server: flips `module` or `native`, or sets `channel`
 *   to the selected value of its select menu.
 * - `pick`: the rule select menu, the rule is its selected value.
 * - `create`: the type select menu, which opens the modal of the name of the rule to create. Its `submit` carries the
 *   type where the others carry the ID of a rule, with the argument `create`.
 * - `view`: shows a section of a rule.
 * - `section`: the section select menu, the section is its selected value.
 * - `toggle`: flips what the argument names: `enabled`, a soft action (`delete`, `alert`, `log`) or `alerts`.
 * - `punishment`: the punishment select menu.
 * - `edit`: opens a modal: `name`, `add` and `remove` (the list), `numbers`, `duration` or `threshold`.
 * - `submit`: the modal `edit` opened, with the same argument.
 * - `clear`: empties the list of the rule.
 * - `roles` and `channels`: the select menus of the exemptions.
 * - `delete`: asks whether to delete the rule, and `confirm` deletes it.
 */
export const AutoModerationMenuVerbs = [
	'list',
	'setting',
	'pick',
	'create',
	'view',
	'section',
	'toggle',
	'punishment',
	'edit',
	'submit',
	'clear',
	'roles',
	'channels',
	'delete',
	'confirm'
] as const;
export type AutoModerationMenuVerb = (typeof AutoModerationMenuVerbs)[number];

export interface AutoModerationMenuAction {
	/**
	 * The user who opened the menu, the only one that can use it.
	 */
	ownerId: Snowflake;
	verb: AutoModerationMenuVerb;

	/**
	 * The ID of the rule, empty for the verbs that have none (`list`, `pick`), and the type of the rule to create for
	 * the `submit` of `create`.
	 */
	ruleId: string;

	/**
	 * The section of the rule to show afterwards.
	 */
	section: AutoModerationMenuSection;

	/**
	 * What the verb applies to, see {@linkcode AutoModerationMenuVerb}.
	 */
	argument: string;
}

/**
 * Builds the custom ID of a component of the menu, `automod.<ownerId>.<verb>:<ruleId>:<section>:<argument>`.
 *
 * @remarks Everything a click needs is in the ID, so the menu keeps working after a restart and on any process.
 */
export function encodeAutoModerationMenuId(action: Pick<AutoModerationMenuAction, 'ownerId' | 'verb'> & Partial<AutoModerationMenuAction>) {
	const { ownerId, verb, ruleId = '', section = 'options', argument = '' } = action;
	return encodeCustomId(AutoModerationMenuHandlerName, ownerId, `${verb}:${ruleId}:${section}:${argument}`);
}

export function isAutoModerationMenuSection(value: unknown): value is AutoModerationMenuSection {
	return AutoModerationMenuSections.includes(value as AutoModerationMenuSection);
}

/**
 * Reads what {@linkcode encodeAutoModerationMenuId} wrote from the content the framework parsed out of a custom ID.
 *
 * @returns The action, or `null` when the custom ID is not one of the menu.
 */
export function decodeAutoModerationMenuId(content: unknown): AutoModerationMenuAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null) return null;

	const [verb, ruleId, section, argument] = decoded.action.split(':');
	if (ruleId === undefined || argument === undefined) return null;
	if (!AutoModerationMenuVerbs.includes(verb as AutoModerationMenuVerb) || !isAutoModerationMenuSection(section)) return null;

	return { ownerId: decoded.sessionId, verb: verb as AutoModerationMenuVerb, ruleId, section, argument };
}
