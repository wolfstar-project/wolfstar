import { compressCustomIdMetadata, decompressCustomIdMetadata } from '#utils/customIdMetadata';
import type { SettingsMenuCustomIdData } from '#lib/types/SettingsMenuCustomId';
import { SettingsMenuAction, SettingsMenuPrefixes, prefixToSettingsMenuAction } from '#lib/types/SettingsMenuCustomId';

export { SettingsMenuAction, SettingsMenuUpdateType, type SettingsMenuCustomIdData } from '#lib/types/SettingsMenuCustomId';

export function buildSettingsMenuCustomId(action: SettingsMenuAction, data: Omit<SettingsMenuCustomIdData, 'a'>): string {
	const metadata = compressCustomIdMetadata<SettingsMenuCustomIdData>({ ...data, a: action });
	return `${SettingsMenuPrefixes[action]}|${metadata}`;
}

export function parseSettingsMenuCustomId(customId: string): { action: SettingsMenuAction; data: SettingsMenuCustomIdData } | null {
	const separatorIndex = customId.indexOf('|');
	if (separatorIndex === -1) return null;

	const prefix = customId.slice(0, separatorIndex);
	const action = prefixToSettingsMenuAction.get(prefix);
	if (action === undefined) return null;

	try {
		const data = decompressCustomIdMetadata<SettingsMenuCustomIdData>(customId.slice(separatorIndex + 1));
		if (data.a !== action) return null;

		return { action, data };
	} catch {
		return null;
	}
}
