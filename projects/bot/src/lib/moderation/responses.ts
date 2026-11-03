import { TypeVariation } from '#utils/moderationConstants';
import { cutText } from '@sapphire/utilities';
import { MaximumModerationResponseLength, type ReadonlyGuildData } from 'wolfstar-database';

/**
 * The settings that hold the custom responses of the moderation commands, see {@linkcode getModerationResponseKey}.
 */
export type ModerationResponseKey =
	| 'messagesResponseBan'
	| 'messagesResponseUnban'
	| 'messagesResponseSoftban'
	| 'messagesResponseKick'
	| 'messagesResponseMute'
	| 'messagesResponseUnmute';

/**
 * The custom responses of a guild, read from its settings.
 */
export type ModerationResponses = Pick<ReadonlyGuildData, ModerationResponseKey>;

/**
 * The setting that holds the custom response of an action: the bans, the softbans, the kicks and the mutes, and the
 * undo of a ban and of a mute. The other actions keep the text the bot writes.
 *
 * @param type - The type of the action.
 * @param undo - Whether the command reverts the action.
 * @returns The key, `null` for an action with no custom response.
 */
export function getModerationResponseKey(type: TypeVariation, undo: boolean): ModerationResponseKey | null {
	switch (type) {
		case TypeVariation.Ban:
			return undo ? 'messagesResponseUnban' : 'messagesResponseBan';
		case TypeVariation.Softban:
			return undo ? null : 'messagesResponseSoftban';
		case TypeVariation.Kick:
			return undo ? null : 'messagesResponseKick';
		case TypeVariation.Mute:
			return undo ? 'messagesResponseUnmute' : 'messagesResponseMute';
		default:
			return null;
	}
}

/**
 * What the placeholders of a custom response are replaced with.
 */
export interface ModerationResponseValues {
	/** The tag of the member, as the text of the bot writes it. */
	user: string;
	/** The reason of the case, empty when it has none. */
	reason: string;
	/** The number of the case. */
	case: string;
	/** The moderator, as a mention. */
	moderator: string;
	/** How long the action lasts, written out, or that it is permanent. */
	duration: string;
}

const Placeholders = ['user', 'reason', 'case', 'moderator', 'duration'] as const satisfies readonly (keyof ModerationResponseValues)[];

/**
 * Writes a custom response: `{user}`, `{reason}`, `{case}`, `{moderator}` and `{duration}` are replaced, whatever
 * their case, and anything else is written as the server wrote it. The answer pings nobody whatever it says: it is
 * sent with no allowed mentions.
 *
 * @param template - The response as the server wrote it.
 * @param values - What the placeholders stand for.
 */
export function formatModerationResponse(template: string, values: ModerationResponseValues): string {
	const content = template.replaceAll(/\{(\w+)\}/g, (match, name: string) => {
		const key = name.toLowerCase() as keyof ModerationResponseValues;
		return Placeholders.includes(key) ? values[key] : match;
	});
	// A reason may be long, so the result is cut past what the response itself can be:
	return cutText(content, MaximumModerationResponseLength + 500);
}
