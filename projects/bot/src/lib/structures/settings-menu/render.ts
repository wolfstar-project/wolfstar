import type { SchemaGroup } from '#lib/database/settings/schema/SchemaGroup';
import type { SchemaKey } from '#lib/database/settings/schema/SchemaKey';
import { getConfigurableGroups, getSchemaPath, isSchemaGroup } from '#lib/database';
import type { ReadonlyGuildData } from 'wolfstar-database';
import type { TranslationKey, Translator } from '#lib/structures/commands/utils';
import { encodeSettingsMenuId, type SettingsMenuVerb } from '#lib/structures/settings-menu/ids';
import {
	displaySettingValue,
	getAvailableLanguages,
	getLanguageName,
	getSettingChannelTypes,
	getSettingKind,
	getSettingMaximumValues,
	getSettingTitle,
	getVisibleGroups,
	getVisibleKeys,
	MaximumSelectValues
} from '#lib/structures/settings-menu/values';
import {
	ButtonStyle,
	ComponentType,
	MessageFlags,
	SelectMenuDefaultValueType,
	TextInputStyle,
	type APIActionRowComponent,
	type APIButtonComponentWithCustomId,
	type APIComponentInContainer,
	type APIComponentInMessageActionRow,
	type APIContainerComponent,
	type APIInteractionResponseCallbackData,
	type APIMessageTopLevelComponent,
	type APIModalInteractionResponseCallbackData,
	type APISectionComponent,
	type APISelectMenuOption,
	type APITextDisplayComponent,
	type Snowflake
} from 'discord-api-types/v10';
import type { Guild } from '@wolfstar/plugin-gateway';

/**
 * How many entries a page of a group shows. A message holds 40 components, and every entry takes three of them (the
 * section, its text and its button) on top of the ones the rest of the menu takes.
 */
const EntriesPerPage = 7;

const AccentColor = 0x5865f2;

/**
 * The emojis of the modules, the first groups of the settings.
 */
const ModuleEmojis: Record<string, string> = {
	'': '⚙️',
	modules: '🧩',
	automod: '🛡️',
	selfmod: '🤖',
	'no-mention-spam': '📣',
	commands: '⌨️',
	logs: '📜',
	moderation: '🔨',
	roles: '🎭'
};

export interface SettingsMenuContext {
	/**
	 * The function to translate with.
	 */
	t: Translator;

	/**
	 * The user who opened the menu, the only one that can use it.
	 */
	ownerId: Snowflake;

	/**
	 * The guild the settings are of.
	 */
	guild: Guild;

	/**
	 * The settings of the guild.
	 */
	settings: ReadonlyGuildData;
}

/**
 * The body of a message of the settings menu, which is made of components only.
 */
export type SettingsMenuMessage = Pick<APIInteractionResponseCallbackData, 'components' | 'flags' | 'allowed_mentions'>;

/**
 * Renders a page of a group: the module select menu, the groups and the keys of the group with the button that opens or
 * edits each, the button that resets the group, and the navigation.
 *
 * @param context - The context of the menu.
 * @param group - The group to render.
 * @param page - The page of the group to render, the last one when it is out of range.
 */
export function renderSettingsGroup(context: SettingsMenuContext, group: SchemaGroup, page: number): SettingsMenuMessage {
	const { t } = context;
	const path = getSchemaPath(group);
	const isRoot = group.parent === null;

	// The groups of the root are the modules, which the select menu lists, so its page only holds its own keys:
	const entries: (SchemaGroup | SchemaKey)[] = [...(isRoot ? [] : getVisibleGroups(group)), ...getVisibleKeys(group)];
	const pages = Math.max(1, Math.ceil(entries.length / EntriesPerPage));
	const current = Math.min(page, pages - 1);
	const id = (verb: SettingsMenuVerb, target: string, targetPage = current) =>
		encodeSettingsMenuId({ ownerId: context.ownerId, verb, target, page: targetPage });

	const body: APIComponentInContainer[] = [];
	if (!isRoot && group.parent!.parent !== null) body.push(text(`### 📁 ${getPathTitle(t, group)}`));

	for (const entry of entries.slice(current * EntriesPerPage, (current + 1) * EntriesPerPage)) {
		if (isSchemaGroup(entry)) {
			const count = getVisibleKeys(entry, true).length;
			body.push(
				section(
					`**📁 ${getSettingTitle(entry)}**\n${t('commands/conf:menuGroupCount', { count })}`,
					button(id('view', getSchemaPath(entry), 0), { emoji: '➡️' })
				)
			);
			continue;
		}

		body.push(
			section(`**${getSettingTitle(entry)}**\n${displaySettingValue(t, entry, context.settings)}`, renderKeyButton(context, entry, current))
		);
	}

	if (entries.length === 0) body.push(text(t('commands/conf:menuRenderNokeys')));

	body.push(
		{ type: ComponentType.Separator },
		section(
			`**⚠️ ${t('commands/conf:menuResetTitle')}**\n${t('commands/conf:menuResetDescription')}`,
			button(id('resetAll', path), { label: t('commands/conf:menuResetButton'), style: ButtonStyle.Danger, disabled: entries.length === 0 })
		)
	);

	const components: APIMessageTopLevelComponent[] = [
		renderHeader(context, group, id('refresh', path)),
		{ type: ComponentType.Container, accent_color: AccentColor, components: body }
	];

	const navigation: APIButtonComponentWithCustomId[] = [];
	if (!isRoot && group.parent!.parent !== null) {
		navigation.push(button(id('view', getSchemaPath(group.parent!), 0), { label: t('commands/conf:menuBack'), emoji: '↩️' }));
	}

	if (pages > 1) {
		navigation.push(
			button(id('view', path, Math.max(0, current - 1)), { emoji: '◀️', disabled: current === 0 }),
			button(id('page', ''), { label: t('commands/conf:menuPage', { page: current + 1, total: pages }), disabled: true }),
			button(id('view', path, Math.min(pages - 1, current + 1)), { emoji: '▶️', disabled: current === pages - 1 })
		);
	}

	// The previous and next buttons of a group with two pages point at the same page, the ID has to be unique:
	if (navigation.length > 0) components.push(row(deduplicate(navigation)));

	return toMessage(components);
}

/**
 * Renders the editor of a key that is picked from a select menu: its description, its value, the select menu and the
 * buttons to go back and to reset it.
 *
 * @param context - The context of the menu.
 * @param key - The key to edit.
 * @param page - The page of the group to go back to.
 */
export function renderSettingsEditor(context: SettingsMenuContext, key: SchemaKey, page: number): SettingsMenuMessage {
	const { t } = context;
	const group = key.parent ?? getConfigurableGroups();
	const id = (verb: SettingsMenuVerb, target: string) => encodeSettingsMenuId({ ownerId: context.ownerId, verb, target, page });

	const description = t(key.description as TranslationKey);
	const value = displaySettingValue(t, key, context.settings);
	const container: APIContainerComponent = {
		type: ComponentType.Container,
		accent_color: AccentColor,
		components: [
			text(`## ✏️ ${getPathTitle(t, group)} › ${getSettingTitle(key)}\n${description}\n\n**${t('commands/conf:menuCurrentValue')}**\n${value}`),
			row([renderSelect(context, key, id('pick', key.property))]),
			row([
				button(id('view', getSchemaPath(group)), { label: t('commands/conf:menuBack'), emoji: '↩️' }),
				button(id('reset', key.property), { label: t('commands/conf:menuResetKey'), style: ButtonStyle.Danger })
			])
		]
	};

	return toMessage([container]);
}

/**
 * Renders the modal of a key that is written: a text input with its value, one per line for the keys that hold a list.
 *
 * @param context - The context of the menu.
 * @param key - The key to edit.
 * @param page - The page of the group to go back to.
 */
export function renderSettingsModal(context: SettingsMenuContext, key: SchemaKey, page: number): APIModalInteractionResponseCallbackData {
	const { t } = context;
	const value = context.settings[key.property] as unknown;
	// A duration is stored in milliseconds, but written as `1h30m`, so it is not written back:
	const current =
		key.type === 'timespan'
			? ''
			: key.array
				? ((value ?? []) as readonly unknown[]).join('\n')
				: value === null || value === undefined
					? ''
					: String(value);

	return {
		custom_id: encodeSettingsMenuId({ ownerId: context.ownerId, verb: 'submit', target: key.property, page }),
		title: truncate(getSettingTitle(key), 45),
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.TextInput,
						custom_id: SettingsModalInputId,
						label: truncate(t(key.array ? 'commands/conf:menuModalLabelList' : 'commands/conf:menuModalLabel'), 45),
						style: key.array ? TextInputStyle.Paragraph : TextInputStyle.Short,
						placeholder: truncate(t(key.description as TranslationKey), 100),
						required: false,
						// Discord rejects an empty value:
						...(current === '' ? {} : { value: truncate(current, 4000) })
					}
				]
			}
		]
	};
}

/**
 * The custom ID of the text input of {@linkcode renderSettingsModal}.
 */
export const SettingsModalInputId = 'value';

function renderHeader(context: SettingsMenuContext, group: SchemaGroup, refreshId: string): APIContainerComponent {
	const { t } = context;
	const root = getConfigurableGroups();

	// The module a group belongs to is the first part of its path, the root one holds the general keys:
	const module = getSchemaPath(group).split('.')[0];
	const options: APISelectMenuOption[] = [
		{ label: t('commands/conf:menuModuleGeneral'), value: RootModuleValue, emoji: { name: ModuleEmojis[''] }, default: module === '' },
		...getVisibleGroups(root).map((entry) => ({
			label: getSettingTitle(entry),
			value: entry.key,
			emoji: { name: ModuleEmojis[entry.key] ?? '📁' },
			default: module === entry.key
		}))
	];

	return {
		type: ComponentType.Container,
		accent_color: AccentColor,
		components: [
			section(
				`## ${t('commands/conf:menuTitle')}\n${t('commands/conf:menuSubtitle', { guild: context.guild.name })}`,
				button(refreshId, { emoji: '🔄' })
			),
			row([
				{
					type: ComponentType.StringSelect,
					custom_id: encodeSettingsMenuId({ ownerId: context.ownerId, verb: 'module', target: '', page: 0 }),
					placeholder: t('commands/conf:menuModulePlaceholder'),
					options: options.slice(0, MaximumSelectValues)
				}
			])
		]
	};
}

/**
 * The value of the general module in the module select menu, Discord rejects an empty one.
 */
export const RootModuleValue = '::root::';

function renderKeyButton(context: SettingsMenuContext, key: SchemaKey, page: number): APIButtonComponentWithCustomId {
	const { t } = context;
	const id = (verb: SettingsMenuVerb) => encodeSettingsMenuId({ ownerId: context.ownerId, verb, target: key.property, page });

	switch (getSettingKind(key)) {
		case 'boolean': {
			const enabled = context.settings[key.property] === true;
			return button(id('toggle'), {
				label: t(enabled ? 'commands/conf:menuValueEnabled' : 'commands/conf:menuValueDisabled'),
				style: enabled ? ButtonStyle.Success : ButtonStyle.Secondary
			});
		}
		case 'readonly':
			return button(id('edit'), { emoji: '🔒', disabled: true });
		default:
			return button(id('edit'), { emoji: '✏️' });
	}
}

function renderSelect(context: SettingsMenuContext, key: SchemaKey, customId: string): APIComponentInMessageActionRow {
	const { t } = context;
	const value = context.settings[key.property] as unknown;
	const values = (key.array ? ((value ?? []) as readonly string[]) : value === null || value === undefined ? [] : [String(value)]).slice(
		0,
		MaximumSelectValues
	);
	const base = { custom_id: customId, min_values: 0, max_values: key.array ? getSettingMaximumValues(key) : 1 };

	switch (getSettingKind(key)) {
		case 'role':
			return {
				...base,
				type: ComponentType.RoleSelect,
				placeholder: t('commands/conf:menuSelectRole'),
				default_values: values.map((id) => ({ id, type: SelectMenuDefaultValueType.Role }))
			};
		case 'channel':
			return {
				...base,
				type: ComponentType.ChannelSelect,
				placeholder: t('commands/conf:menuSelectChannel'),
				channel_types: getSettingChannelTypes(key),
				default_values: values.map((id) => ({ id, type: SelectMenuDefaultValueType.Channel }))
			};
		default: {
			const languages = getAvailableLanguages().slice(0, MaximumSelectValues);
			return {
				...base,
				type: ComponentType.StringSelect,
				min_values: 1,
				max_values: 1,
				placeholder: t('commands/conf:menuSelectLanguage'),
				options: languages.map((code) => ({
					label: truncate(getLanguageName(code), 100),
					value: code,
					description: code,
					default: values.includes(code)
				}))
			};
		}
	}
}

/**
 * The titles of a group and of its parents: `Selfmod › Attachments`.
 */
function getPathTitle(t: Translator, group: SchemaGroup): string {
	if (group.parent === null) return t('commands/conf:menuModuleGeneral');

	const titles: string[] = [];
	for (let current: SchemaGroup | null = group; current !== null && current.parent !== null; current = current.parent) {
		titles.unshift(getSettingTitle(current));
	}

	return titles.join(' › ');
}

function toMessage(components: APIMessageTopLevelComponent[]): SettingsMenuMessage {
	// The values mention roles and channels, which must not ping anybody:
	return { components, flags: MessageFlags.IsComponentsV2, allowed_mentions: { parse: [] } };
}

function text(content: string): APITextDisplayComponent {
	return { type: ComponentType.TextDisplay, content };
}

function section(content: string, accessory: APIButtonComponentWithCustomId): APISectionComponent {
	return { type: ComponentType.Section, components: [text(content)], accessory };
}

function row<T extends APIComponentInMessageActionRow>(components: T[]): APIActionRowComponent<T> {
	return { type: ComponentType.ActionRow, components };
}

interface ButtonOptions {
	label?: string;
	emoji?: string;
	style?: APIButtonComponentWithCustomId['style'];
	disabled?: boolean;
}

function button(customId: string, options: ButtonOptions): APIButtonComponentWithCustomId {
	return {
		type: ComponentType.Button,
		custom_id: customId,
		style: options.style ?? ButtonStyle.Secondary,
		...(options.label === undefined ? {} : { label: truncate(options.label, 80) }),
		...(options.emoji === undefined ? {} : { emoji: { name: options.emoji } }),
		...(options.disabled ? { disabled: true } : {})
	};
}

/**
 * Makes the custom IDs of the buttons unique, by pointing the disabled ones that repeat an ID at nothing.
 */
function deduplicate(buttons: APIButtonComponentWithCustomId[]): APIButtonComponentWithCustomId[] {
	const seen = new Set<string>();
	return buttons.map((entry, index) => {
		if (!seen.has(entry.custom_id)) {
			seen.add(entry.custom_id);
			return entry;
		}

		return { ...entry, custom_id: `${entry.custom_id}:${index}`, disabled: true };
	});
}

function truncate(value: string, maximum: number) {
	return value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;
}
