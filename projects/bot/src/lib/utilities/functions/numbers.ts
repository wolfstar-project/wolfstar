import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';

export function formatNumber(t: TFunction<AnyNamespace>, value: number): string {
	return t('globals:numberValue', { value });
}
