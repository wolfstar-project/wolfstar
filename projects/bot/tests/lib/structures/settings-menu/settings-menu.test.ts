import { getConfigurableGroups, getConfigurableKeys, SchemaKey, SerializerStore, type Serializer } from '#lib/database';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';
import {
	decodeSettingsMenuId,
	displaySettingValue,
	encodeSettingsMenuId,
	getSettingsMenuExpiry,
	isSettingsMenuExpired,
	renderSettingsExpired,
	SettingsMenuLifetime,
	getSettingKind,
	getVisibleGroups,
	getVisibleKeys,
	parseSettingInput,
	renderSettingsEditor,
	renderSettingsGroup,
	renderSettingsModal,
	resolveSettingGroup,
	type SettingsMenuContext
} from '#lib/structures/settings-menu';
import { UserSerializer as NumberSerializer } from '#root/serializers/number';
import { UserSerializer as SnowflakeSerializer } from '#root/serializers/snowflake';
import { UserSerializer as StringSerializer } from '#root/serializers/string';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';
import { ComponentType, MessageFlags } from 'discord-api-types/v10';

const ownerId = '266624760782258186';
const guildId = '254360814063058944';

// Echoes the key and its options, the translations are not what is tested here:
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key);

function createContext(overrides: Partial<ReadonlyGuildData> = {}): SettingsMenuContext {
	return {
		t,
		ownerId,
		guild: { id: guildId, name: 'WolfStar' } as Guild,
		settings: { ...getDefaultGuildSettings(), id: guildId, ...overrides } as ReadonlyGuildData
	};
}

/**
 * Counts a component and everything it holds, the way Discord counts them against the limit of a message.
 */
function countComponents(components: readonly unknown[]): number {
	let count = 0;
	for (const component of components as readonly { components?: unknown[]; accessory?: unknown }[]) {
		count += 1 + countComponents(component.components ?? []) + (component.accessory ? 1 : 0);
	}

	return count;
}

function collectCustomIds(components: readonly unknown[]): string[] {
	const ids: string[] = [];
	for (const component of components as readonly { custom_id?: string; components?: unknown[]; accessory?: unknown }[]) {
		if (component.custom_id) ids.push(component.custom_id);
		ids.push(...collectCustomIds(component.components ?? []), ...collectCustomIds(component.accessory ? [component.accessory] : []));
	}

	return ids;
}

function getAllGroups(group = getConfigurableGroups()): ReturnType<typeof getConfigurableGroups>[] {
	return [group, ...getVisibleGroups(group).flatMap((entry) => getAllGroups(entry))];
}

describe('settings menu', () => {
	describe('custom IDs', () => {
		test('GIVEN an action THEN it survives the round trip the framework parser does', () => {
			const action = { ownerId, verb: 'view', target: 'roles.unique-role-sets', page: 2, expiresAt: 1_800_000_000 } as const;
			const id = encodeSettingsMenuId(action);

			expect(id).toBe(`conf.${ownerId}.view:roles/unique-role-sets:2:${(1_800_000_000).toString(36)}`);
			expect(decodeSettingsMenuId(id.split('.').slice(1))).toEqual(action);
		});

		test('GIVEN a component THEN it expires a quarter of an hour after it is rendered', () => {
			const now = 1_700_000_000_000;
			vi.useFakeTimers({ now });
			try {
				const id = encodeSettingsMenuId({ ownerId, verb: 'refresh', target: '', page: 0 });
				const action = decodeSettingsMenuId(id.split('.').slice(1))!;

				expect(getSettingsMenuExpiry()).toBe(now / 1000 + 900);
				expect(action.expiresAt).toBe(now / 1000 + 900);
				expect(SettingsMenuLifetime).toBe(900_000);
				expect(isSettingsMenuExpired(action, now)).toBe(false);
				expect(isSettingsMenuExpired(action, now + SettingsMenuLifetime - 1)).toBe(false);
				expect(isSettingsMenuExpired(action, now + SettingsMenuLifetime)).toBe(true);
			} finally {
				vi.useRealTimers();
			}
		});

		test('GIVEN a component of a menu from before the menus expired THEN it is expired', () => {
			const action = decodeSettingsMenuId([ownerId, 'view:logs:1'])!;

			expect(action).toEqual({ ownerId, verb: 'view', target: 'logs', page: 1 });
			expect(isSettingsMenuExpired(action)).toBe(true);
			expect(isSettingsMenuExpired(decodeSettingsMenuId([ownerId, 'view:logs:1:nope'])!)).toBe(true);
		});

		test('GIVEN the longest property THEN the custom ID fits in 100 characters', () => {
			for (const key of getConfigurableKeys().values()) {
				const id = encodeSettingsMenuId({ ownerId: '12345678901234567890', verb: 'resetAll', target: key.property, page: 99 });
				expect(id.length).toBeLessThanOrEqual(100);
			}
		});

		test('GIVEN something else THEN it decodes to null', () => {
			expect(decodeSettingsMenuId(null)).toBeNull();
			expect(decodeSettingsMenuId([ownerId, 'view'])).toBeNull();
			expect(decodeSettingsMenuId([ownerId, 'view:logs:-1'])).toBeNull();
		});
	});

	describe('groups', () => {
		test('GIVEN the root THEN the keys that are only on the dashboard are hidden', () => {
			const root = getConfigurableGroups();

			expect(getVisibleKeys(root).map((key) => key.property)).toEqual(['language']);
			expect(getVisibleGroups(root).map((group) => group.key)).not.toContain('permissions');
			expect(getVisibleKeys(root, true).every((key) => !key.dashboardOnly)).toBe(true);
		});

		test('GIVEN a path THEN it resolves the group, and nothing for a key', () => {
			expect(resolveSettingGroup('')).toBe(getConfigurableGroups());
			expect(resolveSettingGroup('automod')?.key).toBe('automod');
			expect(resolveSettingGroup('roles.admin')).toBeNull();
			expect(resolveSettingGroup('nope')).toBeNull();
		});

		test('GIVEN the automod group THEN it only holds its own keys, the rules are not settings', () => {
			const root = getConfigurableGroups();
			const automod = resolveSettingGroup('automod')!;

			expect(getVisibleGroups(root).map((group) => group.key)).not.toContain('selfmod');
			expect(getVisibleGroups(root).map((group) => group.key)).not.toContain('no-mention-spam');
			expect(getVisibleKeys(automod).map((key) => key.name)).toEqual(['automod.channel', 'automod.track-native']);
			expect(getVisibleGroups(automod)).toEqual([]);
		});
	});

	describe('rendering', () => {
		test('GIVEN every page of every group THEN the message fits in the limits of Discord', () => {
			const context = createContext();

			for (const group of getAllGroups()) {
				for (let page = 0; page < 10; page++) {
					const message = renderSettingsGroup(context, group, page);
					const ids = collectCustomIds(message.components!);

					expect(message.flags).toBe(MessageFlags.IsComponentsV2);
					expect(countComponents(message.components!)).toBeLessThanOrEqual(40);
					expect(new Set(ids).size).toBe(ids.length);
					expect(ids.every((id) => id.length <= 100)).toBe(true);
				}
			}
		});

		test('GIVEN a menu THEN its last line says when it closes, and every component expires then', () => {
			const now = 1_700_000_000_000;
			vi.useFakeTimers({ now });
			try {
				const message = renderSettingsGroup(createContext(), resolveSettingGroup('logs')!, 0);
				const last = message.components!.at(-1) as { type: ComponentType; content?: string };
				const expiries = collectCustomIds(message.components!)
					.filter((id) => id.startsWith('conf.'))
					.map((id) => decodeSettingsMenuId(id.split('.').slice(1))?.expiresAt);

				expect(last.type).toBe(ComponentType.TextDisplay);
				expect(last.content).toContain(`<t:${now / 1000 + 900}:R>`);
				expect(expiries.length).toBeGreaterThan(0);
				expect(new Set(expiries)).toEqual(new Set([now / 1000 + 900]));
				expect(countComponents(message.components!)).toBeLessThanOrEqual(40);
			} finally {
				vi.useRealTimers();
			}
		});

		test('GIVEN a menu that expired THEN it is a line that names the command, with nothing to click', () => {
			const message = renderSettingsExpired(createContext().t, 'settings server');

			expect(collectCustomIds(message.components!)).toEqual([]);
			expect(JSON.stringify(message.components)).toContain('`/settings server`');
			expect(message.flags).toBe(MessageFlags.IsComponentsV2);
		});

		test('GIVEN a group with more keys than a page THEN it is paginated', () => {
			const logs = resolveSettingGroup('logs')!;
			const first = collectCustomIds(renderSettingsGroup(createContext(), logs, 0).components!);
			const last = collectCustomIds(renderSettingsGroup(createContext(), logs, 99).components!);

			expect(first.some((id) => id.includes('view:logs:1:'))).toBe(true);
			expect(last.some((id) => id.includes('page::'))).toBe(true);
			expect(first).not.toEqual(last);
		});

		test('GIVEN every key that is picked THEN its editor has a select menu with the stored values', () => {
			const context = createContext({ rolesAdmin: ['111111111111111111', '222222222222222222'] });
			const message = renderSettingsEditor(context, getConfigurableKeys().get('rolesAdmin')!, 0);
			const container = message.components![0] as { components: { components?: { type: ComponentType; default_values?: unknown[] }[] }[] };
			const select = container.components
				.flatMap((component) => component.components ?? [])
				.find((component) => component.type === ComponentType.RoleSelect);

			expect(select?.default_values).toHaveLength(2);
			expect(countComponents(message.components!)).toBeLessThanOrEqual(40);
		});

		test('GIVEN a key that is written THEN its modal holds the stored value', () => {
			const context = createContext({ commandsDisabled: ['ping', 'conf'] });
			const modal = renderSettingsModal(context, getConfigurableKeys().get('commandsDisabled')!, 0);
			const input = (modal.components[0] as { components: { value?: string }[] }).components[0];

			expect(input.value).toBe('ping\nconf');
			expect(modal.title.length).toBeLessThanOrEqual(45);
		});
	});

	describe('values', () => {
		test('GIVEN the keys the menu shows THEN each has an editor', () => {
			const readonly = getVisibleKeys(getConfigurableGroups(), true).filter((key) => getSettingKind(key) === 'readonly');
			expect(readonly.map((key) => key.property)).toEqual([]);
		});

		test('GIVEN values THEN they are displayed by kind', () => {
			const context = createContext({ rolesMuted: '111111111111111111', rolesAdmin: [], modulesAutomod: true });
			const display = (property: string) => displaySettingValue(t, getConfigurableKeys().get(property as never)!, context.settings);

			expect(display('rolesMuted')).toBe('<@&111111111111111111>');
			expect(display('rolesAdmin')).toBe('commands/conf:menuValueNone');
			expect(display('modulesAutomod')).toBe('commands/conf:menuValueEnabled');
			expect(display('moderationChannel')).toBe('commands/conf:settingNotSet');
		});

		describe('parsing', () => {
			beforeAll(async () => {
				container.stores.register(new SerializerStore());
				await container.stores.loadPiece({ store: 'serializers', name: 'number', piece: NumberSerializer });
				await container.stores.loadPiece({ store: 'serializers', name: 'snowflake', piece: SnowflakeSerializer });
				await container.stores.loadPiece({ store: 'serializers', name: 'string', piece: StringSerializer });
				// The pieces registered by hand are constructed when the store loads:
				await container.stores.get('serializers').loadAll();
			});

			// No setting is a number or a list of text since the auto-moderation rules left the settings, so the keys
			// are made here. They are only parsed, which does not read their property:
			const createKey = (options: Pick<SchemaKey, 'type' | 'array' | 'default'> & { minimum?: number; maximum?: number }) =>
				new SchemaKey({
					minimum: null,
					maximum: null,
					...options,
					key: 'test',
					name: 'test',
					property: 'language',
					description: 'settings:language',
					inclusive: true,
					dashboardOnly: false
				});

			const parse = (key: SchemaKey, input: string) => {
				const context = createContext();
				return parseSettingInput({ entry: key, entity: context.settings, guild: context.guild, t } satisfies Serializer.UpdateContext, input);
			};

			test('GIVEN a number THEN it is checked against the range of the key', async () => {
				const key = createKey({ type: 'integer', array: false, default: 15, minimum: 5, maximum: 2000 });

				expect(await parse(key, ' 20 ')).toEqual({ ok: true, value: 20 });
				expect(await parse(key, '')).toEqual({ ok: true, value: key.default });
				expect((await parse(key, '2')).ok).toBe(false);
				expect((await parse(key, '2.5')).ok).toBe(false);
				expect((await parse(key, 'abc')).ok).toBe(false);
			});

			test('GIVEN a list THEN it takes one value per line, without duplicates', async () => {
				const codes = createKey({ type: 'string', array: true, default: [] });
				const guilds = createKey({ type: 'snowflake', array: true, default: [] });

				expect(await parse(codes, 'a\n b \n\na')).toEqual({ ok: true, value: ['a', 'b'] });
				expect(await parse(guilds, '254360814063058944')).toEqual({ ok: true, value: ['254360814063058944'] });
				expect((await parse(guilds, 'not-an-id')).ok).toBe(false);
			});
		});
	});
});
