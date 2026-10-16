import type { ModerationManager } from '#lib/moderation/managers/ModerationManager';
import type { RoleSetupMessage } from '#lib/moderation/structures/RoleSetupPrompt';
import { getTranslationKey } from '#lib/moderation/common/util';
import type { TranslationKey, Translator } from '#lib/structures/commands/utils';
import { minutes } from '#common';
import { time, TimestampStyles, userMention } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import { ButtonStyle, ComponentType, type Snowflake } from 'discord-api-types/v10';

/**
 * The name of the interaction handler of the prompt that confirms a punishment, which is also the first part of its
 * custom IDs.
 */
export const RecentCaseHandlerName = 'moderationConfirm';

/**
 * What a button of the prompt does: `confirm` takes the action anyway, `cancel` takes none.
 */
export type RecentCaseVerb = 'confirm' | 'cancel';

export interface RecentCaseAction {
	/**
	 * The moderator who ran the command, the only one that can answer the prompt.
	 */
	ownerId: Snowflake;
	verb: RecentCaseVerb;

	/**
	 * The ID of the interaction of the command, which names what waits for the answer.
	 */
	promptId: Snowflake;
}

/**
 * Builds the custom ID of a button of the prompt, `moderationConfirm.<ownerId>.<verb>:<promptId>`.
 */
export function encodeRecentCaseId(action: RecentCaseAction) {
	return encodeCustomId(RecentCaseHandlerName, action.ownerId, `${action.verb}:${action.promptId}`);
}

/**
 * Reads what {@linkcode encodeRecentCaseId} wrote from the content the framework parsed out of a custom ID.
 *
 * @returns The action, or `null` when the custom ID is not one of the prompt.
 */
export function decodeRecentCaseId(content: unknown): RecentCaseAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null) return null;

	const [verb, promptId] = decoded.action.split(':');
	if ((verb !== 'confirm' && verb !== 'cancel') || promptId === undefined || !/^\d{17,20}$/.test(promptId)) return null;

	return { ownerId: decoded.sessionId, verb, promptId };
}

/**
 * The latest case of a member made within the given minutes, the one a second moderator should know about before
 * acting: archived cases are left out, as the undo of a case is not.
 *
 * @param entries - The cases of the member.
 * @param withinMinutes - How recent the case is, `0` never finds one.
 * @param now - The time to count from.
 */
export function findRecentCase<Entry extends Pick<ModerationManager.Entry, 'id' | 'createdAt' | 'isArchived'>>(
	entries: Iterable<Entry>,
	withinMinutes: number,
	now = Date.now()
): Entry | null {
	if (withinMinutes <= 0) return null;

	const since = now - minutes(withinMinutes);
	let latest: Entry | null = null;
	for (const entry of entries) {
		if (entry.isArchived() || entry.createdAt < since) continue;
		if (latest === null || entry.id > latest.id) latest = entry;
	}

	return latest;
}

/**
 * Renders the prompt a moderator gets when the member already has a recent case: what the case is, and buttons to take
 * the action anyway or to cancel.
 *
 * @param t - The function to translate with, in the language of the moderator.
 * @param action - Who answers and what waits for the answer, its verb is set per button.
 * @param entry - The recent case.
 */
export function renderRecentCasePrompt(t: Translator, action: Omit<RecentCaseAction, 'verb'>, entry: ModerationManager.Entry): RoleSetupMessage {
	const id = (verb: RecentCaseVerb) => encodeRecentCaseId({ ...action, verb });
	const content = t('moderationActions:recentCasePrompt', {
		user: userMention(entry.userId),
		case: entry.id,
		type: t(getTranslationKey(entry.type) as TranslationKey),
		moderator: userMention(entry.moderatorId),
		time: time(Math.floor(entry.createdAt / 1000), TimestampStyles.RelativeTime),
		reason: entry.reason ?? t('moderationActions:recentCaseNoReason')
	});

	return {
		content: cutText(content, 2000),
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.Button,
						custom_id: id('confirm'),
						style: ButtonStyle.Danger,
						label: cutText(t('moderationActions:recentCaseConfirm'), 80)
					},
					{
						type: ComponentType.Button,
						custom_id: id('cancel'),
						style: ButtonStyle.Secondary,
						label: cutText(t('moderationActions:recentCaseCancel'), 80)
					}
				]
			}
		],
		allowed_mentions: { parse: [] }
	};
}

/**
 * The command that waits for its prompt to be answered: the piece to run again and the options it was given.
 */
export interface PendingRecentCaseCommand {
	command: string;
	args: Record<string, unknown>;
}

/**
 * How long the command waits for the moderator to answer.
 */
const PendingSeconds = minutes.toSeconds(5);

function getPendingKey(guildId: Snowflake, ownerId: Snowflake, promptId: Snowflake) {
	return `wolfstar:moderation:confirm:${guildId}:${ownerId}:${promptId}`;
}

/**
 * Keeps the command that opened the prompt, so it is run once the moderator confirms: a click only carries the ID of its
 * button. It is in Redis, for whichever process handles the click.
 */
export async function savePendingRecentCaseCommand(guildId: Snowflake, ownerId: Snowflake, promptId: Snowflake, pending: PendingRecentCaseCommand) {
	await container.redis.set(getPendingKey(guildId, ownerId, promptId), JSON.stringify(pending), 'EX', PendingSeconds);
}

/**
 * Takes the command {@linkcode savePendingRecentCaseCommand} kept, once.
 *
 * @returns The command, or `null` when it expired or was answered already.
 */
export async function takePendingRecentCaseCommand(
	guildId: Snowflake,
	ownerId: Snowflake,
	promptId: Snowflake
): Promise<PendingRecentCaseCommand | null> {
	const raw = await container.redis.getdel(getPendingKey(guildId, ownerId, promptId));
	return raw === null ? null : (JSON.parse(raw) as PendingRecentCaseCommand);
}
