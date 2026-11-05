import { getColumnLimit } from './columns';
import { ConfigurationFileVersion, MaximumConfigurationFileSize, findPortableKey } from './format';
import { create } from '#utils/Security/RegexCreator';
import type { SchemaKey } from '#lib/database/settings/schema/SchemaKey';
import type { ReadonlyGuildData } from '#lib/database/settings/types';
import type { TFunction } from '@sapphire/plugin-i18next';
import type { Guild } from 'discord.js';
export interface ConfigurationIssue {
	path: string;
	message: string;
}

export interface ParsedConfiguration {
	settings: { key: SchemaKey; value: unknown }[];
}

export type ParseConfigurationResult = { ok: true; value: ParsedConfiguration } | { ok: false; issues: ConfigurationIssue[] };

export interface ParseConfigurationContext {
	settings: ReadonlyGuildData;
	guild: Guild;
	t: TFunction;
}

const FileFields = new Set(['version', 'exportedAt', 'settings']);

export async function parseConfigurationFile(text: string, context: ParseConfigurationContext): Promise<ParseConfigurationResult> {
	const { t } = context;
	if (Buffer.byteLength(text, 'utf8') > MaximumConfigurationFileSize)
		return failure([{ path: '', message: t('commands/conf:transferErrorDownload') }]);

	let data: unknown;
	try {
		data = JSON.parse(text.replace(/^\uFEFF/, ''));
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
	checkWordFilter(settings, context, issues);
	return issues.length === 0 ? { ok: true, value: { settings } } : failure(issues);
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

async function checkValue(key: SchemaKey, value: unknown, context: Parameters<SchemaKey['serializer']['isValid']>[1]): Promise<string | null> {
	const { t } = context;
	const type = getJsonType(key);
	// The serializers read what they are given as what they expect, a number is not a text:
	if (!type.matches(value)) return t('commands/conf:transferErrorWrongType', { name: key.name, type: type.name });

	if (typeof value === 'number' && (!Number.isFinite(value) || (key.type !== 'float' && key.type !== 'number' && !Number.isInteger(value))))
		return t('commands/conf:transferErrorInvalidValue', { name: key.name });
	const size = typeof value === 'number' ? value : !key.array && typeof value === 'string' ? value.length : null;
	if (
		size !== null &&
		((key.minimum !== null && (key.inclusive ? size < key.minimum : size <= key.minimum)) ||
			(key.maximum !== null && (key.inclusive ? size > key.maximum : size >= key.maximum)))
	)
		return t('commands/conf:transferErrorInvalidValue', { name: key.name });
	const column = getColumnLimit(key);
	// PostgreSQL counts the characters of a `VarChar`, which JavaScript counts twice when they are past U+FFFF:
	if (column?.kind === 'text' && typeof value === 'string' && [...value].length > column.maximum)
		return t('commands/conf:transferErrorTooLong', { name: key.name, maximum: column.maximum });
	if (column?.kind === 'number' && typeof value === 'number' && (value < column.minimum || value > column.maximum))
		return t('commands/conf:transferErrorOutOfRange', { name: key.name, minimum: column.minimum, maximum: column.maximum });

	try {
		const valid = await key.serializer.isValid(value as never, context);
		return valid ? null : t('commands/conf:transferErrorInvalidValue', { name: key.name });
	} catch (error) {
		// The serializers throw the translated reason, as a text or as an error:
		if (typeof error === 'string') return error;
		return error instanceof Error ? error.message : t('commands/conf:transferErrorInvalidValue', { name: key.name });
	}
}

/**
 * The words of the filter are compiled into one pattern once they are saved, which a word such as `[z-a]` breaks after
 * the import was written: it is compiled here, so the file is refused before anything is.
 */
function checkWordFilter(settings: ParsedConfiguration['settings'], { t }: ParseConfigurationContext, issues: ConfigurationIssue[]) {
	const words = settings.find(({ key }) => key.property === 'selfmodFilterRaw')?.value;
	if (!Array.isArray(words) || words.length === 0) return;

	try {
		new RegExp(create(words as string[]), 'gi');
	} catch {
		const key = settings.find((setting) => setting.key.property === 'selfmodFilterRaw')!.key;
		issues.push({ path: `settings.${key.name}`, message: t('commands/conf:transferErrorWordFilter', { name: key.name }) });
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

function failure(issues: ConfigurationIssue[]): ParseConfigurationResult {
	return { ok: false, issues };
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
