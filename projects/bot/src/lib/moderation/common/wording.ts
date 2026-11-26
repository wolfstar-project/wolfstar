import type { TranslationKey, Translator } from '#lib/structures/commands/utils';
import type { EmojiKey } from '#utils/emojis';
import { TypeVariation } from '#utils/moderationConstants';

/**
 * The name of each type of case in the keys of its sentences: `commands/moderation:done.ban`,
 * `commands/moderation:dmTitle.mute`, `moderationActions:recentVerb.warning`.
 */
const WordingNames = {
	[TypeVariation.Ban]: 'ban',
	[TypeVariation.Kick]: 'kick',
	[TypeVariation.Mute]: 'mute',
	[TypeVariation.Softban]: 'softban',
	[TypeVariation.VoiceKick]: 'voiceKick',
	[TypeVariation.VoiceMute]: 'voiceMute',
	[TypeVariation.Warning]: 'warning',
	[TypeVariation.RestrictedReaction]: 'restrictedReaction',
	[TypeVariation.RestrictedEmbed]: 'restrictedEmbed',
	[TypeVariation.RestrictedAttachment]: 'restrictedAttachment',
	[TypeVariation.RestrictedVoice]: 'restrictedVoice',
	[TypeVariation.SetNickname]: 'setNickname',
	[TypeVariation.RoleAdd]: 'roleAdd',
	[TypeVariation.RoleRemove]: 'roleRemove',
	[TypeVariation.RestrictedEmoji]: 'restrictedEmoji',
	[TypeVariation.Timeout]: 'timeout',
	[TypeVariation.Note]: 'note'
} as const satisfies Record<TypeVariation, string>;

/**
 * What a case of a type is called in its sentences, see {@linkcode WordingNames}.
 */
export function getWordingName(type: TypeVariation): string {
	return WordingNames[type];
}

/**
 * The sentence a moderation command answers with when the action worked: "Successfully muted @user".
 *
 * @param t - The function to translate with.
 * @param type - The type of the case.
 * @param undo - Whether the command undid the action ("Successfully unmuted @user").
 * @param user - How the user is written, a mention.
 */
export function getModerationDoneSentence(t: Translator, type: TypeVariation, undo: boolean, user: string): string {
	return t(`commands/moderation:${undo ? 'undone' : 'done'}.${getWordingName(type)}` as TranslationKey, { user });
}

/**
 * The title of the direct message the user of a case gets: "You were muted in **Server**".
 *
 * @param t - The function to translate with, in the language of the guild.
 * @param type - The type of the case.
 * @param undo - Whether the case undoes an action ("You were unmuted in **Server**").
 * @param guild - The name of the guild.
 */
export function getModerationDirectMessageTitle(t: Translator, type: TypeVariation, undo: boolean, guild: string): string {
	return t(`commands/moderation:${undo ? 'dmUndoneTitle' : 'dmTitle'}.${getWordingName(type)}` as TranslationKey, { guild });
}

/**
 * What was done to the user of a recent case, as the prompt that asks to confirm another action says it: "muted".
 *
 * @param t - The function to translate with.
 * @param type - The type of the recent case.
 * @param undo - Whether the recent case undid an action ("unmuted").
 */
export function getRecentCaseVerb(t: Translator, type: TypeVariation, undo: boolean): string {
	return t(`moderationActions:${undo ? 'recentUndoneVerb' : 'recentVerb'}.${getWordingName(type)}` as TranslationKey);
}

const CaseTypeEmojis: Partial<Record<TypeVariation, EmojiKey>> = {
	[TypeVariation.Ban]: 'Ban',
	[TypeVariation.Kick]: 'Kick',
	[TypeVariation.Mute]: 'Mute',
	[TypeVariation.Softban]: 'Softban',
	[TypeVariation.VoiceKick]: 'Kick',
	[TypeVariation.VoiceMute]: 'Mute',
	[TypeVariation.Warning]: 'Warning',
	[TypeVariation.Timeout]: 'Timeout',
	[TypeVariation.Note]: 'Note'
};

/**
 * The emoji of a type of case, the shield of the moderators for the ones that have none of their own.
 */
export function getCaseTypeEmojiKey(type: TypeVariation): EmojiKey {
	return CaseTypeEmojis[type] ?? 'Moderator';
}

/**
 * Quotes a text line by line (`> `), so the lines written after it are not quoted too: Discord quotes the whole rest
 * of a message after a `>>> `, which also makes a second `>>> ` read as text.
 *
 * @param text - The text to quote.
 */
export function quoteLines(text: string): string {
	return text
		.split('\n')
		.map((line) => `> ${line}`)
		.join('\n');
}
