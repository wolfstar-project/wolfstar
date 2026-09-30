import type { AnyNamespace } from '@wolfstar/plugin-i18next';
import type { ParseKeys } from 'i18next';

/**
 * Every translation key, written `<namespace>:<key>`, known through the typed resources that
 * `pnpm --filter wolfstar-bot i18n:generate` emits into `src/@types/i18next.d.ts`.
 */
export type TranslationKey = ParseKeys<AnyNamespace>;

/**
 * A translation key. The generic parameter is only kept so ported code keeps compiling: the type a key
 * resolves to is inferred from the generated resources by `t`, not carried by the key.
 */
export type TypedT<_TCustom = string> = TranslationKey;

/**
 * A translation key that takes interpolation arguments. The arguments are inferred from the generated
 * resources by `t`, the generic parameters are only kept so ported code keeps compiling.
 */
export type TypedFT<_TArgs extends object = object, _TReturn = string> = TranslationKey;

export type GetTypedT<T> = T extends TypedT<infer U> ? U : never;

/**
 * Asserts that `key` is a known translation key, and returns it unchanged.
 * @param key The key, written `<namespace>:<key>`.
 */
export function T<const Key extends TranslationKey>(key: Key): Key {
	return key;
}

/**
 * Asserts that `key` is a known translation key taking interpolation arguments, and returns it unchanged.
 * @param key The key, written `<namespace>:<key>`.
 */
export function FT<_TArgs extends object = object, _TReturn = string, const Key extends TranslationKey = TranslationKey>(key: Key): Key {
	return key;
}

export interface Value<T = string> {
	value: T;
}

export interface Values<T = string> {
	values: readonly T[];
	count: number;
}

export interface Difference<T = string> {
	previous: T;
	next: T;
}

export interface Parameter {
	parameter: string;
}
