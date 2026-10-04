import { getConfigurableGroups, isSchemaGroup, type ReadonlyGuildData, type Serializer } from '#lib/database';
import type { Translator } from '#lib/structures/commands/utils';
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
			return 'number';
		// The serializers of these have no parser, they are only configurable on the dashboard:
		case 'notAllowed':
		case 'permissionNode':
		case 'reactionRole':
		case 'stickyRole':
			return 'readonly';
		default:
			return 'text';
	}
}

/**
 * The types of channel a key accepts, for the channel select menu.
 */
export function getSettingChannelTypes(key: SchemaKey): ChannelType[] {
	switch (key.type) {
		case 'guildVoiceChannel':
			return [ChannelType.GuildVoice];
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
 * The result of reading a value for a key: the value to store, or the translated reason it is not valid.
 */
export type ParsedSetting = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Parses what a user wrote in the modal of a `number` or `text` key, with the serializer of the key.
 *
 * @remarks
 *
 * An empty input resets the key to its default. A key that holds a list takes one value per line, and the list
 * replaces the stored one.
 *
 * @param context - The context of the serializer.
 * @param input - What the user wrote.
 */
export async function parseSettingInput(context: Serializer.UpdateContext, input: string): Promise<ParsedSetting> {
	const { entry: key, t } = context;
	const trimmed = input.trim();
	if (trimmed === '') return { ok: true, value: key.default };
	if (!key.array) return parseSettingValue(context, trimmed);

	const lines = trimmed.split('\n').filter((line) => line.trim() !== '');
	const { serializer } = key;
	const values: unknown[] = [];
	for (const line of lines) {
		const parsed = await parseSettingValue(context, line);
		if (!parsed.ok) return parsed;
		if (!values.some((value) => serializer.equals(value as never, parsed.value as never))) values.push(parsed.value);
	}

	const maximum = getSettingMaximumValues(key);
	if (values.length > maximum) return { ok: false, error: t('commands/conf:menuTooManyValues', { name: key.name, max: maximum }) };

	return { ok: true, value: values };
}

async function parseSettingValue(context: Serializer.UpdateContext, input: string): Promise<ParsedSetting> {
	const result = await context.entry.serializer.parse(input, context);
	return result.match<ParsedSetting, ParsedSetting>({
		ok: (value) => ({ ok: true, value }),
		err: (error) => ({ ok: false, error: error.message })
	});
}

/**
 * Validates the values picked in the select menu of a key, with the serializer of the key.
 *
 * @param context - The context of the serializer.
 * @param values - The picked values.
 * @returns The value to store: the list for the keys that hold one, otherwise the value, or the default of the key when
 * the selection was cleared.
 */
export async function validateSettingPick(context: Serializer.UpdateContext, values: readonly string[]): Promise<ParsedSetting> {
	const { entry: key, t } = context;
	const { serializer } = key;

	for (const value of values) {
		try {
			if (!(await serializer.isValid(value as never, context))) {
				return { ok: false, error: t('commands/conf:menuInvalidValue', { name: key.name }) };
			}
		} catch (error) {
			// The serializers throw the translated reason:
			return { ok: false, error: typeof error === 'string' ? error : error instanceof Error ? error.message : String(error) };
		}
	}

	if (key.array) return { ok: true, value: [...values] };
	return { ok: true, value: values[0] ?? key.default };
}
