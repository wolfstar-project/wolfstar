import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The name of the interaction handler of the settings menu, which is also the first part of its custom IDs.
 */
export const SettingsMenuHandlerName = 'conf';

/**
 * What a component of the settings menu does:
 *
 * - `view`: shows a page of a group, the argument is the path of the group.
 * - `refresh`: shows the same page again, with the current values.
 * - `module`: the module select menu, the group is its selected value.
 * - `toggle`: flips a boolean key.
 * - `edit`: opens the editor of a key, a view or a modal depending on its kind.
 * - `pick`: the select menu of the editor of a key.
 * - `submit`: the modal of the editor of a key.
 * - `reset`: resets a key to its default.
 * - `resetAll`: resets every key of a group to its default, after a confirmation.
 * - `page`: the page indicator, which does nothing.
 * - `userToggle`: flips a setting of the user, the menu of `/settings user`, the target is the setting.
 */
export type SettingsMenuVerb = 'view' | 'refresh' | 'module' | 'toggle' | 'edit' | 'pick' | 'submit' | 'reset' | 'resetAll' | 'page' | 'userToggle';

export interface SettingsMenuAction {
	/**
	 * The user who opened the menu, the only one that can use it.
	 */
	ownerId: Snowflake;
	verb: SettingsMenuVerb;

	/**
	 * The path of a group (`view`, `refresh`, `resetAll`) or the property of a key, empty for `module` and `page`.
	 */
	target: string;

	/**
	 * The page of the group to show afterwards.
	 */
	page: number;
}

/**
 * Builds the custom ID of a component of the settings menu, `conf.<ownerId>.<verb>:<target>:<page>`.
 *
 * @remarks
 *
 * Everything a click needs is in the ID, so the menu keeps working after a restart and on any process. The path of a
 * group is written with `/`, since the framework splits the custom IDs on `.`.
 */
export function encodeSettingsMenuId(action: SettingsMenuAction) {
	return encodeCustomId(SettingsMenuHandlerName, action.ownerId, `${action.verb}:${action.target.replaceAll('.', '/')}:${action.page}`);
}

/**
 * Reads what {@linkcode encodeSettingsMenuId} wrote from the content the framework parsed out of a custom ID.
 *
 * @returns The action, or `null` when the custom ID is not one of the settings menu.
 */
export function decodeSettingsMenuId(content: unknown): SettingsMenuAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null) return null;

	const [verb, target, page] = decoded.action.split(':');
	if (verb === undefined || target === undefined || page === undefined) return null;

	const pageNumber = Number(page);
	if (!Number.isSafeInteger(pageNumber) || pageNumber < 0) return null;

	return { ownerId: decoded.sessionId, verb: verb as SettingsMenuVerb, target: target.replaceAll('/', '.'), page: pageNumber };
}
