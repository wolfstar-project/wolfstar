import type { Command, InGuild } from '@wolfstar/http-framework';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import type { ParseKeys } from 'i18next';

/**
 * A chat input interaction that was sent from a guild, which is the only place the moderation and management commands
 * are registered for (`InteractionContextType.Guild`).
 */
export type GuildChatInputInteraction = InGuild<Command.ChatInputInteraction>;

/**
 * A `<namespace>:<key>` of the generated translation typings.
 */
export type TranslationKey = ParseKeys<AnyNamespace>;

/**
 * Resolves a translation key of any namespace with a function that was bound through `getSupportedUserLanguageT`.
 *
 * @remarks
 *
 * The bound function only types the keys of the default namespace, and the interpolation options of the keys of the
 * other ones depend on the generated typings, so this keeps the key checked and leaves the options loose. A key that
 * is only known at runtime, for example the identifier of an error, needs to be cast to {@linkcode TranslationKey}.
 *
 * @param t - The function to translate with.
 * @param key - The key to translate.
 * @param options - The interpolation options.
 */
export function translateKey(t: TFunction, key: TranslationKey, options?: Record<string, unknown>): string {
	return (t as unknown as (key: string, options?: Record<string, unknown>) => string)(key, options);
}

/**
 * A translation function that takes the keys of every namespace, see {@linkcode createTranslator}.
 */
export type Translator = (key: TranslationKey, options?: Record<string, unknown>) => string;

/**
 * Binds {@linkcode translateKey} to a function, so the commands can call `t('namespace:key', options)`.
 *
 * @param t - The function to translate with, e.g. the one `getSupportedUserLanguageT(interaction)` returns.
 */
export function createTranslator(t: TFunction): Translator {
	return (key, options) => translateKey(t, key, options);
}
