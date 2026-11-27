import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The name of the interaction handler of the case menu, which is also the first part of its custom IDs.
 */
export const CaseMenuHandlerName = 'caseMenu';

/**
 * What a component of the case menu does:
 *
 * - `list`: shows a page of the list, the target is what the list shows, see {@linkcode encodeCaseListTarget}.
 * - `filter`: the select menu of the list, the filter is its selected value and the target what the list showed.
 * - `view`: answers with a case, the target is its ID, as it is for every verb below.
 * - `edit`: opens the modal that edits a case, `editSubmit` is that modal.
 * - `close`: opens the modal that closes a case, `closeSubmit` is that modal.
 * - `history`: answers with the changes that were made to a case.
 * - `delete`: asks whether to delete a case, `deleteConfirm` deletes it and `deleteCancel` shows the case again.
 */
export const CaseMenuVerbs = [
	'list',
	'filter',
	'view',
	'edit',
	'editSubmit',
	'close',
	'closeSubmit',
	'history',
	'delete',
	'deleteConfirm',
	'deleteCancel'
] as const;
export type CaseMenuVerb = (typeof CaseMenuVerbs)[number];

export interface CaseMenuAction {
	/**
	 * The moderator who opened the menu, the only one that can use it.
	 */
	ownerId: Snowflake;
	verb: CaseMenuVerb;
	target: string;
	page: number;
}

/**
 * Builds the custom ID of a component of the case menu, `caseMenu.<ownerId>.<verb>:<target>:<page>`.
 *
 * @remarks Everything a click needs is in the ID, so the menu keeps working after a restart and on any process.
 */
export function encodeCaseMenuId(action: CaseMenuAction) {
	return encodeCustomId(CaseMenuHandlerName, action.ownerId, `${action.verb}:${action.target}:${action.page}`);
}

/**
 * Reads what {@linkcode encodeCaseMenuId} wrote from the content the framework parsed out of a custom ID.
 *
 * @returns The action, or `null` when the custom ID is not one of the case menu.
 */
export function decodeCaseMenuId(content: unknown): CaseMenuAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null) return null;

	const [verb, target, page] = decoded.action.split(':');
	if (!(CaseMenuVerbs as readonly unknown[]).includes(verb) || target === undefined || page === undefined) return null;

	const pageNumber = Number(page);
	if (!Number.isSafeInteger(pageNumber) || pageNumber < 0) return null;

	return { ownerId: decoded.sessionId, verb: verb as CaseMenuVerb, target, page: pageNumber };
}

/**
 * Reads the ID of the case a component is about from its target.
 *
 * @returns The ID, or `null` when the target is not one.
 */
export function decodeCaseMenuCaseId(target: string): number | null {
	if (!/^\d{1,9}$/.test(target)) return null;

	const caseId = Number(target);
	return caseId > 0 ? caseId : null;
}
