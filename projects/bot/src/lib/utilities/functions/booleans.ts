import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';

export function formatBoolean(t: TFunction<AnyNamespace>, value: boolean): string {
	return t(value ? 'globals:yes' : 'globals:no');
}
