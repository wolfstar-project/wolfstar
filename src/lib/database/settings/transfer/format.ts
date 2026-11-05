import { getConfigurableKeys } from '#lib/database/settings/configuration';
import type { SchemaKey } from '#lib/database/settings/schema/SchemaKey';
import type { ReadonlyGuildData } from '#lib/database/settings/types';

// V7 has a different settings/automod schema and will use version 2.
export const ConfigurationFileVersion = 1;
export const MaximumConfigurationFileSize = 1024 * 1024;
export const ConfigurationFileName = 'wolfstar-settings.json';
const PortableTypes = new Set<string>(['boolean', 'command', 'commandmatch', 'float', 'integer', 'language', 'number', 'string', 'timespan', 'url']);

export function getPortableKeys(): SchemaKey[] {
	return [...getConfigurableKeys().values()].filter((key) => PortableTypes.has(key.type));
}

export function findPortableKey(name: string): SchemaKey | null {
	return getPortableKeys().find((key) => key.name === name) ?? null;
}

export interface ConfigurationFile {
	version: typeof ConfigurationFileVersion;
	exportedAt: string;
	settings: Record<string, unknown>;
}

export function createConfigurationFile(settings: ReadonlyGuildData, exportedAt = new Date()): ConfigurationFile {
	return {
		version: ConfigurationFileVersion,
		exportedAt: exportedAt.toISOString(),
		settings: Object.fromEntries(
			getPortableKeys().map((key) => {
				const value = settings[key.property];
				return [key.name, typeof value === 'bigint' ? Number(value) : Array.isArray(value) ? [...value] : value];
			})
		)
	};
}
