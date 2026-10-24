import {
	ConfigurationFileVersion,
	ConfigurationRuleFields,
	findPortableKey,
	RemovedSettings,
	toConfigurationRule,
	type ConfigurationRule
} from '#lib/database/settings/transfer/format';
import type { SchemaKey } from '#lib/database/settings/schema/SchemaKey';
import { checkAutoModerationRuleOptions, parseAutoModerationRulePatch } from '#lib/moderation/automod/validation';
import type { Translator } from '#lib/structures/commands/utils';
import type { Guild } from '@wolfstar/plugin-gateway';
import {
	AutoModerationRuleTypes,
	getDefaultAutoModerationRule,
	getDefaultAutoModerationRuleOptions,
	isAutoModerationRuleType,
	MaximumAutoModerationRuleNameLength,
	MaximumAutoModerationRules,
	type AutoModerationRule,
	type ReadonlyGuildData
} from 'wolfstar-database';

/**
 * What is wrong with a part of a file.
 */
export interface ConfigurationIssue {
	/** Where in the file, `settings.language` or `automod.rules[2]`. Empty for the file as a whole. */
	path: string;
	/** What is wrong, translated. */
	message: string;
}

/**
 * What a file holds once every value of it was validated.
 */
export interface ParsedConfiguration {
	/** The settings the file has, validated, the lists without their duplicates. */
	settings: { key: SchemaKey; value: unknown }[];
	/** The rules of the file, `null` when it has no `automod` section: the rules of the server are left alone. */
	rules: ConfigurationRule[] | null;
}

export type ParseConfigurationResult = { ok: true; value: ParsedConfiguration } | { ok: false; issues: ConfigurationIssue[] };

export interface ParseConfigurationContext {
	/** The settings of the server the file is imported in, which the serializers validate against. */
	settings: ReadonlyGuildData;
	/**
	 * The rules of the server the file is imported in: a list of a rule can be as long as the one the rule of the same
	 * name and type has there, however long that is.
	 */
	rules: readonly AutoModerationRule[];
	guild: Guild;
	t: Translator;
}

const FileFields = new Set(['version', 'exportedAt', 'settings', 'automod']);

/**
 * Reads the file the export of the settings menu writes, from text that is not trusted.
 *
 * @remarks
 *
 * Nothing is written, and nothing is dropped: the file is accepted whole or refused with everything that is wrong in it.
 * What a setting is validated with is its serializer (`isValid`, as the dashboard does), and a rule goes through
 * `parseAutoModerationRulePatch`, as the body of a request to the API does: a list of its options holds
 * `MaximumAutoModerationRuleListLength` entries at most, or as many as the rule of the server it is imported on has, so
 * the backup of a rule that was migrated with more can be restored and a file cannot make a list grow past the limit. A setting that is not one of the file (it
 * depends on the server, or it does not exist) is refused instead of ignored, so a file written by hand does not look
 * as if it did something it does not.
 *
 * @param text - The content of the file.
 * @param context - What the values are validated against.
 */
export async function parseConfigurationFile(text: string, context: ParseConfigurationContext): Promise<ParseConfigurationResult> {
	const { t } = context;

	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return failure([{ path: '', message: t('commands/conf:transferErrorJson') }]);
	}

	if (!isRecord(data)) return failure([{ path: '', message: t('commands/conf:transferErrorObject') }]);

	const { version } = data;
	if (typeof version !== 'number' || !Number.isInteger(version)) {
		return failure([{ path: 'version', message: t('commands/conf:transferErrorVersion') }]);
	}

	if (version !== ConfigurationFileVersion) {
		return failure([
			{ path: 'version', message: t('commands/conf:transferErrorVersionUnsupported', { version, supported: ConfigurationFileVersion }) }
		]);
	}

	const issues: ConfigurationIssue[] = [];
	for (const field of Object.keys(data)) {
		if (!FileFields.has(field)) issues.push({ path: field, message: t('commands/conf:transferErrorUnknownField', { path: field }) });
	}

	const settings = await parseSettings(data.settings, context, issues);
	const rules = parseRules(data.automod, context, issues);
	return issues.length === 0 ? { ok: true, value: { settings, rules } } : failure(issues);
}

async function parseSettings(section: unknown, context: ParseConfigurationContext, issues: ConfigurationIssue[]) {
	const settings: ParsedConfiguration['settings'] = [];
	if (section === undefined) return settings;

	const { t } = context;
	if (!isRecord(section)) {
		issues.push({ path: 'settings', message: t('commands/conf:transferErrorExpectedObject', { path: 'settings' }) });
		return settings;
	}

	for (const [name, value] of Object.entries(section)) {
		if (RemovedSettings.has(name)) continue;

		const path = `settings.${name}`;
		const key = findPortableKey(name);
		if (key === null) {
			issues.push({ path, message: t('commands/conf:transferErrorUnknownSetting', { name }) });
			continue;
		}

		const result = await validateValue(key, value, context);
		if (result.ok) settings.push({ key, value: result.value });
		else issues.push({ path, message: result.message });
	}

	return settings;
}

type ValueResult = { ok: true; value: unknown } | { ok: false; message: string };

/**
 * Validates the value of a setting the way the dashboard does: every value of a list goes through the `isValid` of the
 * serializer of the setting, and a list is held to the maximum of the setting.
 */
async function validateValue(key: SchemaKey, value: unknown, { settings, guild, t }: ParseConfigurationContext): Promise<ValueResult> {
	const context = { entry: key, entity: settings, guild, t };
	const { name } = key;

	if (!key.array) {
		if (value === null && key.default === null) return { ok: true, value };
		if (Array.isArray(value)) return { ok: false, message: t('commands/conf:transferErrorExpectedValue', { name }) };

		const message = await checkValue(key, value, context);
		return message === null ? { ok: true, value } : { ok: false, message };
	}

	if (!Array.isArray(value)) return { ok: false, message: t('commands/conf:transferErrorExpectedArray', { name }) };

	const { serializer } = key;
	const values: unknown[] = [];
	for (const entry of value) {
		const message = await checkValue(key, entry, context);
		if (message !== null) return { ok: false, message };

		if (!values.some((other) => serializer.equals(other as never, entry as never))) values.push(entry);
	}

	if (key.maximum !== null && values.length > key.maximum) {
		return { ok: false, message: t('commands/conf:menuTooManyValues', { name, max: key.maximum }) };
	}

	return { ok: true, value: values };
}

/**
 * @returns The translated reason the value is not valid for the setting, `null` when it is.
 */
async function checkValue(key: SchemaKey, value: unknown, context: Parameters<SchemaKey['serializer']['isValid']>[1]): Promise<string | null> {
	const { t } = context;
	const type = getJsonType(key);
	// The serializers read what they are given as what they expect, a number is not a text:
	if (!type.matches(value)) return t('commands/conf:transferErrorWrongType', { name: key.name, type: type.name });

	try {
		const valid = await key.serializer.isValid(value as never, context);
		return valid ? null : t('commands/conf:transferErrorInvalidValue', { name: key.name });
	} catch (error) {
		// The serializers throw the translated reason, as a text or as an error:
		if (typeof error === 'string') return error;
		return error instanceof Error ? error.message : t('commands/conf:transferErrorInvalidValue', { name: key.name });
	}
}

function getJsonType(key: SchemaKey) {
	switch (key.type) {
		case 'boolean':
			return { name: 'boolean', matches: (value: unknown) => typeof value === 'boolean' };
		case 'float':
		case 'integer':
		case 'number':
		case 'timespan':
			return { name: 'number', matches: (value: unknown) => typeof value === 'number' };
		default:
			return { name: 'text', matches: (value: unknown) => typeof value === 'string' };
	}
}

function parseRules(section: unknown, context: ParseConfigurationContext, issues: ConfigurationIssue[]): ConfigurationRule[] | null {
	if (section === undefined) return null;

	const { t } = context;

	if (!isRecord(section)) {
		issues.push({ path: 'automod', message: t('commands/conf:transferErrorExpectedObject', { path: 'automod' }) });
		return null;
	}

	for (const field of Object.keys(section)) {
		if (field !== 'rules')
			issues.push({ path: `automod.${field}`, message: t('commands/conf:transferErrorUnknownField', { path: `automod.${field}` }) });
	}

	const { rules: list } = section;
	if (!Array.isArray(list)) {
		issues.push({ path: 'automod.rules', message: t('commands/conf:transferErrorRuleList') });
		return null;
	}

	if (list.length > MaximumAutoModerationRules) {
		issues.push({ path: 'automod.rules', message: t('commands/auto-moderation:errorLimit', { maximum: MaximumAutoModerationRules }) });
		return null;
	}

	const rules: ConfigurationRule[] = [];
	const names = new Set<string>();
	for (const [index, entry] of list.entries()) {
		const path = `automod.rules[${index}]`;
		const before = issues.length;
		const rule = parseRule(entry, path, context, issues);
		if (rule === null) continue;

		const lower = rule.name.toLowerCase();
		if (names.has(lower)) issues.push({ path, message: t('commands/conf:transferErrorRuleNameTaken', { name: rule.name }) });
		names.add(lower);

		if (issues.length === before) rules.push(rule);
	}

	return rules;
}

function parseRule(entry: unknown, path: string, context: ParseConfigurationContext, issues: ConfigurationIssue[]): ConfigurationRule | null {
	const { t } = context;
	if (!isRecord(entry)) {
		issues.push({ path, message: t('commands/conf:transferErrorRuleObject') });
		return null;
	}

	const before = issues.length;
	const known = new Set<string>(ConfigurationRuleFields);
	for (const field of Object.keys(entry)) {
		if (!known.has(field))
			issues.push({ path: `${path}.${field}`, message: t('commands/conf:transferErrorUnknownField', { path: `${path}.${field}` }) });
	}

	const { type, name } = entry;
	if (!isAutoModerationRuleType(type)) {
		issues.push({ path: `${path}.type`, message: t('commands/conf:transferErrorRuleType', { types: AutoModerationRuleTypes.join(', ') }) });
		return null;
	}

	// The name is checked as `createAutoModerationRule` does, a name made of digits could be taken for an ID:
	const trimmed = typeof name === 'string' ? name.trim() : '';
	if (trimmed.length === 0 || trimmed.length > MaximumAutoModerationRuleNameLength || /^\d+$/.test(trimmed)) {
		issues.push({ path: `${path}.name`, message: t('commands/conf:transferErrorRuleName', { maximum: MaximumAutoModerationRuleNameLength }) });
		return null;
	}

	const report = (errors: readonly string[]) => {
		for (const error of errors) issues.push({ path: `${path}.${error.split(':')[0]}`, message: error });
	};

	// The patch below repairs the options it reads (a wrong type takes its default, a bad entry is dropped), which
	// would have a broken file empty the options of a rule: they are checked as they are written first.
	if (isRecord(entry.options)) report(checkAutoModerationRuleOptions(type, entry.options));

	// The type is not a field of the patch, the options of the rule depend on it:
	const fields = { ...entry };
	delete fields.type;

	// The patch reads the options on top of the ones it is given, and lets a list be as long as the one they have. The
	// rule of the server is only there for that: an option the file leaves out takes its default, not the one of the
	// server, so the options are given whole. The file replaces the rule with the defaults plus its own fields, so a
	// Timeout is checked against the defaults and not against the action the rule of the server has, unless the file
	// keeps the action and the duration that rule has: a rule saved as a Timeout with no duration (the menu asks for the
	// duration after the action) is then imported back as it was exported.
	const lower = trimmed.toLowerCase();
	const current = context.rules.find((rule) => rule.type === type && rule.name.toLowerCase() === lower);
	if (isRecord(entry.options)) fields.options = { ...getDefaultAutoModerationRuleOptions(type), ...entry.options };

	const defaults = getDefaultAutoModerationRule(type);
	const keepsPunishment =
		current !== undefined &&
		(entry.hardAction ?? defaults.hardAction) === current.hardAction &&
		((entry.hardActionDuration as number | null | undefined) || defaults.hardActionDuration || null) === (current.hardActionDuration || null);
	const parsed = parseAutoModerationRulePatch(
		type,
		fields,
		keepsPunishment
			? { options: current.options, hardAction: current.hardAction, hardActionDuration: current.hardActionDuration }
			: { options: current?.options }
	);
	if (parsed.errors) {
		report(parsed.errors);
		return null;
	}

	if (issues.length !== before) return null;

	// What the file leaves out takes the default of the type, as it does when a rule is created:
	return toConfigurationRule({ ...getDefaultAutoModerationRule(type), ...parsed.data, name: trimmed, type });
}

function failure(issues: ConfigurationIssue[]): ParseConfigurationResult {
	return { ok: false, issues };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
