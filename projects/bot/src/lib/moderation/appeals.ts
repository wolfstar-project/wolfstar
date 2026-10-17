import { readSettings } from '#lib/database/settings/functions';
import type { ModerationManager } from '#lib/moderation/managers/ModerationManager';
import { TypeVariation } from '#utils/moderationConstants';
import { Urls } from '#utils/constants';
import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import type { Snowflake } from 'discord-api-types/v10';
import type { ReadonlyGuildData } from 'wolfstar-database';

/**
 * The name of the interaction handler of the buttons of an appeal, which is also the first part of their custom IDs.
 */
export const AppealHandlerName = 'appeal';

/**
 * The types of case a member can appeal, each enabled by a setting of the guild.
 */
export const AppealableTypes = [TypeVariation.Ban, TypeVariation.Mute, TypeVariation.Timeout] as const;
export type AppealableType = (typeof AppealableTypes)[number];

/**
 * Whether a guild takes the appeals of a type of case.
 *
 * @param settings - The settings of the guild.
 * @param type - The type of the case.
 */
export function isAppealable(
	settings: Pick<ReadonlyGuildData, 'appealsEnabled' | 'appealsBans' | 'appealsMutes' | 'appealsTimeouts'>,
	type: TypeVariation
) {
	if (!settings.appealsEnabled) return false;
	switch (type) {
		case TypeVariation.Ban:
			return settings.appealsBans;
		case TypeVariation.Mute:
			return settings.appealsMutes;
		case TypeVariation.Timeout:
			return settings.appealsTimeouts;
		default:
			return false;
	}
}

/**
 * The page of the website where a member appeals the cases of a guild. The direct message of a case links to it: the
 * case does not have its number yet when the message is sent, so the page lists the cases the member can appeal.
 */
export function getAppealUrl(guildId: Snowflake) {
	return `${Urls.Website}/appeal/${guildId}`;
}

/**
 * Whether the direct message of a case links to the appeal page, read when the message is written.
 */
export async function shouldLinkAppeal(guildId: Snowflake, type: TypeVariation, undo: boolean) {
	if (undo) return false;
	return isAppealable(await readSettings(guildId), type);
}

/**
 * What {@linkcode findAppealableCases} reads of a case.
 */
export interface AppealableCase {
	readonly id: number;
	readonly type: TypeVariation;
	readonly userId: Snowflake;
	isUndo(): boolean;
	isArchived(): boolean;
	isCompleted(): boolean;
}

/**
 * The cases of a member they can appeal: the latest one of each type the guild takes appeals for, when it is still in
 * course (not undone, not ended, not archived).
 *
 * @param entries - The cases of the guild, or of the member.
 * @param userId - The member.
 * @param settings - The settings of the guild.
 */
export function findAppealableCases<Entry extends AppealableCase>(
	entries: Iterable<Entry>,
	userId: Snowflake,
	settings: Pick<ReadonlyGuildData, 'appealsEnabled' | 'appealsBans' | 'appealsMutes' | 'appealsTimeouts'>
): Entry[] {
	const latest = new Map<TypeVariation, Entry>();
	for (const entry of entries) {
		if (entry.userId !== userId || entry.isArchived() || !isAppealable(settings, entry.type)) continue;

		const known = latest.get(entry.type);
		if (known === undefined || entry.id > known.id) latest.set(entry.type, entry);
	}

	return [...latest.values()].filter((entry) => !entry.isUndo() && !entry.isCompleted()).sort((a, b) => b.id - a.id);
}

/**
 * What a button of an appeal does: `accept` undoes the case, `deny` keeps it; each asks for a reason in a modal, which
 * `submit` is the custom ID of.
 */
export type AppealVerb = 'accept' | 'deny';

export interface AppealAction {
	appealId: string;
	verb: AppealVerb;
	/** Whether it is the modal of the reason, not the button that opens it. */
	submit: boolean;
}

/**
 * Builds the custom ID of a button, or of the modal it opens, `appeal.<appealId>.<verb>:<submit>`.
 */
export function encodeAppealId(action: AppealAction) {
	return encodeCustomId(AppealHandlerName, action.appealId, `${action.verb}:${action.submit ? 1 : 0}`);
}

/**
 * Reads what {@linkcode encodeAppealId} wrote.
 *
 * @returns The action, `null` when the custom ID is not one of an appeal.
 */
export function decodeAppealId(content: unknown): AppealAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null || !/^\d{1,19}$/.test(decoded.sessionId)) return null;

	const [verb, submit] = decoded.action.split(':');
	if ((verb !== 'accept' && verb !== 'deny') || (submit !== '0' && submit !== '1')) return null;
	return { appealId: decoded.sessionId, verb, submit: submit === '1' };
}

/**
 * The action that undoes an appealable case.
 */
export function getAppealUndoActionName(type: AppealableType) {
	switch (type) {
		case TypeVariation.Ban:
			return 'ban' as const;
		case TypeVariation.Mute:
			return 'mute' as const;
		case TypeVariation.Timeout:
			return 'timeout' as const;
	}
}

export type AppealCase = ModerationManager.Entry;
