import { resolveT, TResolvable } from '#lib/i18n/translate';

export function formatBoolean(t: TResolvable, value: boolean): string {
	const tFunction = resolveT(t);
	return tFunction(value ? 'globals:yes' : 'globals:no');
}
