import { CommandMatcher, getConfigurableGroups, isSchemaGroup, type ReadonlyGuildData, type SchemaGroup, type SchemaKey } from '#lib/database';
import type { TranslationKey, Translator } from '#lib/structures/commands/utils';
import { channelMention, inlineCode, roleMention } from '@discordjs/formatters';
import { isNullish, isNullishOrEmpty, toTitleCase } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { ChannelType } from 'discord-api-types/v10';

/**
 * How a key is displayed and edited:
 *
 * - `boolean`: toggled with its button.
 * - `role`, `channel` and `language`: picked from a select menu.
 * - `number` and `text`: written in a modal, one value per line for the keys that hold a list.
 * - `readonly`: displayed only, the menu has no editor for its type.
 */
export type SettingKind = 'boolean' | 'role' | 'channel' | 'language' | 'number' | 'text' | 'readonly';

export function getSettingKind(key: SchemaKey): SettingKind {
	switch (key.type) {
		case 'boolean':
			return 'boolean';
		case 'role':
			return 'role';
		case 'guildTextChannel':
		case 'guildVoiceChannel':
		case 'guildCategoryChannel':
		case 'categoryOrTextChannel':
			return 'channel';
		case 'language':
			return 'language';
		case 'integer':
		case 'number':
		case 'float':
			return key.array ? 'readonly' : 'number';
		case 'string':
		case 'snowflake':
		case 'commandMatch':
			return 'text';
		default:
			return 'readonly';
	}
}

/**
 * The types of channel a key accepts, for the channel select menu.
 */
export function getSettingChannelTypes(key: SchemaKey): ChannelType[] {
	switch (key.type) {
		case 'guildVoiceChannel':
			return [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
		case 'guildCategoryChannel':
			return [ChannelType.GuildCategory];
		case 'categoryOrTextChannel':
			return [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildCategory];
		default:
			return [ChannelType.GuildText, ChannelType.GuildAnnouncement];
	}
}

/**
 * The most values Discord lets a select menu hold.
 */
export const MaximumSelectValues = 25;

/**
 * The most values a key that holds a list accepts, the smallest of its own maximum and of what its editor can hold.
 */
export function getSettingMaximumValues(key: SchemaKey) {
	const kind = getSettingKind(key);
	const limit = kind === 'role' || kind === 'channel' ? MaximumSelectValues : MaximumTextValues;
	return Math.min(key.maximum ?? limit, limit);
}

const MaximumTextValues = 100;
const MaximumTextValueLength = 100;

/**
 * The title of a group or of a key, from the last part of its path: `ignored-roles` is `Ignored Roles`.
 */
export function getSettingTitle(value: SchemaGroup | SchemaKey) {
	return value.key
		.split('-')
		.map((part) => toTitleCase(part))
		.join(' ');
}

/**
 * The keys of a group the menu shows, that is the ones that are not only configurable on the dashboard.
 */
export function getVisibleKeys(group: SchemaGroup, recursive = false): SchemaKey[] {
	const keys: SchemaKey[] = [];
	for (const entry of group.values()) {
		if (isSchemaGroup(entry)) {
			if (recursive) keys.push(...getVisibleKeys(entry, true));
		} else if (!entry.dashboardOnly) {
			keys.push(entry);
		}
	}

	return keys;
}

/**
 * The groups of a group that hold at least one key the menu shows.
 */
export function getVisibleGroups(group: SchemaGroup): SchemaGroup[] {
	return [...group.values()].filter((entry): entry is SchemaGroup => isSchemaGroup(entry) && getVisibleKeys(entry, true).length > 0);
}

/**
 * Resolves the group of a path, the root one for an empty path.
 */
export function resolveSettingGroup(path: string): SchemaGroup | null {
	if (path === '') return getConfigurableGroups();

	const value = getConfigurableGroups().getPathString(path);
	return !isNullish(value) && isSchemaGroup(value) ? value : null;
}

/**
 * The most characters of a displayed value, so that a page of them fits in a message.
 */
const MaximumDisplayLength = 300;

/**
 * Formats the value of a key for the menu.
 *
 * @param t - The function to translate with.
 * @param key - The key to display the value of.
 * @param settings - The settings of the guild.
 */
export function displaySettingValue(t: Translator, key: SchemaKey, settings: ReadonlyGuildData): string {
	const value = settings[key.property] as unknown;

	if (key.array) {
		const values = (value ?? []) as readonly unknown[];
		if (values.length === 0) return t('commands/conf:menuValueNone');

		const displayed: string[] = [];
		let length = 0;
		for (const entry of values) {
			const text = displaySingleValue(t, key, entry);
			if (length + text.length > MaximumDisplayLength) break;
			displayed.push(text);
			length += text.length + 2;
		}

		const hidden = values.length - displayed.length;
		const list = displayed.join(', ');
		return hidden === 0 ? list : `${list} ${t('commands/conf:menuValueMore', { count: hidden })}`;
	}

	return isNullish(value) || value === '' ? t('commands/conf:settingNotSet') : displaySingleValue(t, key, value);
}

function displaySingleValue(t: Translator, key: SchemaKey, value: unknown): string {
	switch (getSettingKind(key)) {
		case 'boolean':
			return t(value ? 'commands/conf:menuValueEnabled' : 'commands/conf:menuValueDisabled');
		case 'role':
			return roleMention(String(value));
		case 'channel':
			return channelMention(String(value));
		case 'language':
			return `${getLanguageName(String(value))} (${inlineCode(String(value))})`;
		case 'number':
			return String(value);
		default:
			return typeof value === 'string' || typeof value === 'number' ? inlineCode(String(value)) : inlineCode(JSON.stringify(value));
	}
}

/**
 * The name of a language in that language, its code when the runtime does not know it.
 */
export function getLanguageName(code: string) {
	try {
		const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
		return isNullishOrEmpty(name) ? code : toTitleCase(name);
	} catch {
		return code;
	}
}

/**
 * The languages the bot is translated to, which are the values the `language` keys accept.
 */
export function getAvailableLanguages(): string[] {
	return [...container.i18n.languages.keys()].sort();
}

/**
 * The result of parsing what a user wrote in the modal of a key: the value to store, or the translated reason it is not
 * valid.
 */
export type ParsedSetting = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Parses what a user wrote in the modal of a `number` or `text` key.
 *
 * @remarks
 *
 * An empty input resets the key to its default. A key that holds a list takes one value per line, and the list
 * replaces the stored one.
 *
 * @param t - The function to translate the errors with.
 * @param key - The key the input is for.
 * @param input - What the user wrote.
 */
export function parseSettingInput(t: Translator, key: SchemaKey, input: string): ParsedSetting {
	const trimmed = input.trim();
	if (trimmed === '') return { ok: true, value: key.default };

	if (getSettingKind(key) === 'number') return parseNumber(t, key, trimmed);
	if (!key.array) return parseText(t, key, trimmed);

	const lines = [...new Set(trimmed.split('\n').map((line) => line.trim())).values()].filter((line) => line !== '');
	const maximum = getSettingMaximumValues(key);
	if (lines.length > maximum) return { ok: false, error: t('commands/conf:menuTooManyValues', { name: key.name, max: maximum }) };

	const values: unknown[] = [];
	for (const line of lines) {
		const parsed = parseText(t, key, line);
		if (!parsed.ok) return parsed;
		values.push(parsed.value);
	}

	return { ok: true, value: values };
}

function parseNumber(t: Translator, key: SchemaKey, input: string): ParsedSetting {
	const value = Number(input);
	const valid = key.type === 'integer' ? /^-?\d+$/.test(input) && Number.isSafeInteger(value) : Number.isFinite(value);
	if (!valid) return { ok: false, error: t('commands/conf:menuInvalidNumber', { value: input }) };

	const { minimum, maximum, inclusive, name } = key;
	const aboveMinimum = minimum === null || (inclusive ? value >= minimum : value > minimum);
	const belowMaximum = maximum === null || (inclusive ? value <= maximum : value < maximum);
	if (aboveMinimum && belowMaximum) return { ok: true, value };

	return { ok: false, error: t(getRangeErrorKey(minimum, maximum, inclusive), { name, min: minimum, max: maximum }) };
}

function getRangeErrorKey(minimum: number | null, maximum: number | null, inclusive: boolean): TranslationKey {
	if (minimum !== null && maximum !== null) return inclusive ? 'serializers:minMaxBothInclusive' : 'serializers:minMaxBothExclusive';
	if (minimum !== null) return inclusive ? 'serializers:minMaxMinInclusive' : 'serializers:minMaxMinExclusive';
	return inclusive ? 'serializers:minMaxMaxInclusive' : 'serializers:minMaxMaxExclusive';
}

function parseText(t: Translator, key: SchemaKey, input: string): ParsedSetting {
	if (input.length > MaximumTextValueLength) {
		return { ok: false, error: t('commands/conf:menuValueTooLong', { value: input.slice(0, 20), max: MaximumTextValueLength }) };
	}

	switch (key.type) {
		case 'snowflake':
			return /^\d{17,20}$/.test(input)
				? { ok: true, value: input }
				: { ok: false, error: t('commands/conf:menuInvalidSnowflake', { value: input }) };
		case 'commandMatch':
			return matchesAnyCommand(input)
				? { ok: true, value: input }
				: { ok: false, error: t('commands/conf:menuInvalidCommand', { value: input }) };
		default:
			return { ok: true, value: input };
	}
}

/**
 * Whether a command pattern (`*`, `category.*`, `category.command` or `command`) matches at least one command.
 */
function matchesAnyCommand(pattern: string) {
	for (const command of container.stores.get('commands').values()) {
		if (CommandMatcher.match(pattern, command)) return true;
	}

	return false;
}
