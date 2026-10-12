import { getConfigurableKeys } from '#lib/database/settings/configuration';
import type { SchemaKey, SchemaKeyType } from '#lib/database/settings/schema/SchemaKey';
import type { AutoModerationRule, AutoModerationRuleData, ReadonlyGuildData } from 'wolfstar-database';

/**
 * The version of the file `/settings server export` writes. It changes when a file of the previous version can no
 * longer be read, which a setting or a field that is added does not do: it is left out of the files that predate it.
 */
export const ConfigurationFileVersion = 1;

/**
 * The most bytes of a file an import reads. The biggest configuration, 25 rules with their lists at the limit, is a
 * fraction of it.
 */
export const MaximumConfigurationFileSize = 1024 * 1024;

export const ConfigurationFileName = 'wolfstar-settings.json';

/**
 * The kinds of value that are the same in every server. A setting of another kind (a role, a channel, a user, a set of
 * them) names something of the server it was written in, so it stays out of the file: an import leaves it as the
 * server it is run in has it.
 *
 * @remarks A type has to be listed here to be exported, so a new kind of setting is not carried across servers until
 * somebody decides that it can be.
 */
const PortableTypes = new Set<SchemaKeyType>([
	'boolean',
	'command',
	'commandMatch',
	'float',
	'honeypotAction',
	'integer',
	'language',
	'messageUpdateStyle',
	'number',
	'string',
	'timespan',
	'url'
]);

/**
 * Whether the value of a setting is the same in every server, so it goes in the file.
 */
export function isPortableKey(key: SchemaKey): boolean {
	return PortableTypes.has(key.type);
}

/**
 * The settings of the file, by their name (`modules.automod`), in the order the settings menu shows them.
 */
export function getPortableKeys(): SchemaKey[] {
	return [...getConfigurableKeys().values()].filter((key) => isPortableKey(key));
}

/**
 * Finds a setting of the file by its name.
 *
 * @param name - The name of the setting, as the settings menu and the dashboard show it.
 * @returns The setting, `null` when there is none or it is not one of the file.
 */
export function findPortableKey(name: string): SchemaKey | null {
	return getPortableKeys().find((key) => key.name === name) ?? null;
}

/**
 * The fields of a rule of the file. What names something of the server (`ignoredRoles`, `ignoredChannels`) and what is
 * of the database (`id`, `guildId`) are not in it.
 */
export const ConfigurationRuleFields = [
	'name',
	'type',
	'enabled',
	'softAction',
	'hardAction',
	'hardActionDuration',
	'thresholdMaximum',
	'thresholdDuration',
	'options',
	'escalation',
	'escalationDuration'
] as const satisfies readonly (keyof AutoModerationRuleData)[];

/**
 * A rule as the file holds it.
 */
export type ConfigurationRule = Pick<AutoModerationRuleData, (typeof ConfigurationRuleFields)[number]>;

/**
 * The file `/settings server export` answers with, and `/settings server import` reads.
 */
export interface ConfigurationFile {
	version: typeof ConfigurationFileVersion;
	/** When the file was made, as an ISO 8601 date. Informative: an import does not read it. */
	exportedAt: string;
	/** The settings that do not depend on the server, by name. */
	settings: Record<string, unknown>;
	automod: {
		rules: ConfigurationRule[];
	};
}

/**
 * Picks what a rule of the file holds out of a rule.
 */
export function toConfigurationRule(rule: Pick<AutoModerationRule, (typeof ConfigurationRuleFields)[number]>): ConfigurationRule {
	return {
		name: rule.name,
		type: rule.type,
		enabled: rule.enabled,
		softAction: rule.softAction,
		hardAction: rule.hardAction,
		hardActionDuration: rule.hardActionDuration,
		thresholdMaximum: rule.thresholdMaximum,
		thresholdDuration: rule.thresholdDuration,
		options: rule.options,
		escalation: rule.escalation,
		escalationDuration: rule.escalationDuration
	};
}

/**
 * Makes the file of the configuration of a server.
 *
 * @param settings - The settings of the server.
 * @param rules - The auto-moderation rules of the server.
 * @param exportedAt - When the file is made.
 */
export function createConfigurationFile(
	settings: ReadonlyGuildData,
	rules: readonly AutoModerationRule[],
	exportedAt: Date = new Date()
): ConfigurationFile {
	const values: Record<string, unknown> = {};
	for (const key of getPortableKeys()) {
		const value = settings[key.property];
		// The settings are read only, and the file is serialized as it is made:
		values[key.name] = Array.isArray(value) ? [...value] : value;
	}

	return {
		version: ConfigurationFileVersion,
		exportedAt: exportedAt.toISOString(),
		settings: values,
		automod: { rules: rules.map((rule) => toConfigurationRule(rule)) }
	};
}
