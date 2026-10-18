import { getConfigurableGroups, getConfigurableKeys, SchemaKey, SerializerStore, type Serializer } from '#lib/database';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';
import {
	decodeSettingsMenuId,
	displaySettingValue,
	encodeSettingsMenuId,
	getSettingsMenuExpiry,
	isSettingsMenuExpired,
	claimSettingsExpiredNotice,
	renderSettingsExpired,
	SettingsMenuLifetime,
	getSettingKind,
	getVisibleGroups,
	getVisibleKeys,
	parseSettingInput,
	renderSettingsEditor,
	renderSettingsGroup,
	renderSettingsModal,
	renderSettingsImportModal,
	readSettingsImportSubmission,
	resolveSettingGroup,
	SettingsImportFileInputId,
	SettingsImportTextInputId,
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

			expect(getVisibleKeys(root).map((key) => key.property)).toEqual(['language', 'timezone', 'updatesChannel']);
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

		test('GIVEN a menu THEN the last line of its last container says when it closes, and every component expires then', () => {
			const now = 1_700_000_000_000;
			vi.useFakeTimers({ now });
			try {
				const message = renderSettingsGroup(createContext(), resolveSettingGroup('logs')!, 0);
				const container = message.components!.findLast((component) => component.type === ComponentType.Container) as {
					type: ComponentType;
					components: { type: ComponentType; content?: string }[];
				};
				const last = container.components.at(-1)!;
				const expiries = collectCustomIds(message.components!)
					.filter((id) => id.startsWith('conf.'))
					.map((id) => decodeSettingsMenuId(id.split('.').slice(1))?.expiresAt);

				expect(container.type).toBe(ComponentType.Container);
				expect(last.type).toBe(ComponentType.TextDisplay);
				expect(last.content).toContain(`<t:${now / 1000 + 900}:R>`);
				expect(expiries.length).toBeGreaterThan(0);
				expect(new Set(expiries)).toEqual(new Set([now / 1000 + 900]));
				expect(countComponents(message.components!)).toBeLessThanOrEqual(40);
			} finally {
				vi.useRealTimers();
			}
		});

		test('GIVEN a menu that expired THEN a click is told the command that opens it again', () => {
			expect(renderSettingsExpired(createContext().t, 'server')).toContain('`/settings server`');
			expect(renderSettingsExpired(createContext().t, 'user')).toContain('`/settings user`');
		});

		test('GIVEN a command Discord gave an ID THEN the command is a mention', () => {
			const previous = (container as any).applicationCommandRegistry;
			(container as any).applicationCommandRegistry = {
				getLoadedChatInputCommands: () => new Map([['settings', { getGlobalId: () => '1234567890' }]])
			};
			try {
				expect(renderSettingsExpired(createContext().t, 'server')).toContain('</settings server:1234567890>');
			} finally {
				(container as any).applicationCommandRegistry = previous;
			}
		});

		describe('clicks on an expired menu', () => {
			const counts = new Map<string, number>();
			const redis = {
				status: 'ready',
				incr: async (key: string) => {
					const next = (counts.get(key) ?? 0) + 1;
					counts.set(key, next);
					return next;
				},
				pexpire: vi.fn(async () => 1)
			};
			let previous: unknown;

			beforeAll(() => {
				previous = (container as any).redis;
				(container as any).redis = redis;
			});

			afterAll(() => {
				(container as any).redis = previous;
			});

			beforeEach(() => {
				counts.clear();
				redis.pexpire.mockClear();
			});

			test('GIVEN a user who keeps clicking THEN the first five clicks are answered, and the sixth is not', async () => {
				const answers: boolean[] = [];
				for (let click = 0; click < 7; click++) answers.push(await claimSettingsExpiredNotice('1', '2'));

				expect(answers).toEqual([true, true, true, true, true, false, false]);
				expect(redis.pexpire).toHaveBeenCalledTimes(1);
			});

			test('GIVEN another menu or another user THEN they are counted apart', async () => {
				for (let click = 0; click < 6; click++) await claimSettingsExpiredNotice('1', '2');

				await expect(claimSettingsExpiredNotice('1', '3')).resolves.toBe(true);
				await expect(claimSettingsExpiredNotice('4', '2')).resolves.toBe(true);
			});
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

		test('GIVEN a key with a few options THEN its editor has a select menu with each one, the stored one picked', () => {
			const context = createContext({ logsMessageUpdateStyle: 'Separate' });
			const key = getConfigurableKeys().get('logsMessageUpdateStyle')!;
			const message = renderSettingsEditor(context, key, 0);
			const container = message.components![0] as {
				components: { components?: { type: ComponentType; options?: { value: string; label: string; default: boolean }[] }[] }[];
			};
			const select = container.components
				.flatMap((component) => component.components ?? [])
				.find((component) => component.type === ComponentType.StringSelect);

			expect(getSettingKind(key)).toBe('choice');
			expect(select?.options?.map((option) => [option.value, option.label, option.default])).toEqual([
				['Difference', 'serializers:messageUpdateStyleDifference', false],
				['Separate', 'serializers:messageUpdateStyleSeparate', true]
			]);
		});

		test('GIVEN a key with a few options THEN its value is displayed translated', () => {
			const key = getConfigurableKeys().get('logsMessageUpdateStyle')!;

			expect(displaySettingValue(t, key, createContext().settings)).toBe('serializers:messageUpdateStyleDifference');
			expect(displaySettingValue(t, key, createContext({ logsMessageUpdateStyle: 'Separate' }).settings)).toBe(
				'serializers:messageUpdateStyleSeparate'
			);
		});

		test('GIVEN a key that is written THEN its modal holds the stored value', () => {
			const context = createContext({ commandsDisabled: ['ping', 'conf'] });
			const modal = renderSettingsModal(context, getConfigurableKeys().get('commandsDisabled')!, 0);
			const input = (modal.components[0] as { components: { value?: string }[] }).components[0];

			expect(input.value).toBe('ping\nconf');
			expect(modal.title.length).toBeLessThanOrEqual(45);
		});
	});

	describe('export and import', () => {
		const verbs = (message: ReturnType<typeof renderSettingsGroup>) =>
			collectCustomIds(message.components!)
				.filter((id) => id.startsWith('conf.'))
				.map((id) => decodeSettingsMenuId(id.split('.').slice(1))?.verb);

		test('GIVEN the page of the general module THEN it has the buttons that export and import the configuration', () => {
			const message = renderSettingsGroup(createContext(), getConfigurableGroups(), 0);

			expect(verbs(message)).toEqual(expect.arrayContaining(['export', 'import']));
			expect(countComponents(message.components!)).toBeLessThanOrEqual(40);
		});

		test('GIVEN the page of another module THEN it has neither', () => {
			const message = renderSettingsGroup(createContext(), resolveSettingGroup('logs')!, 0);

			expect(verbs(message)).not.toContain('export');
			expect(verbs(message)).not.toContain('import');
		});

		test('GIVEN the modal of the import THEN it takes a file or the pasted JSON, both optional, and submits to the menu', () => {
			const modal = renderSettingsImportModal(createContext(), 2);
			const [description, file, pasted] = modal.components as unknown as [
				{ type: ComponentType },
				{ type: ComponentType; label: string; component: { type: ComponentType; custom_id: string; required: boolean; max_values: number } },
				{ type: ComponentType; label: string; component: { type: ComponentType; custom_id: string; required: boolean; max_length: number } }
			];

			expect(decodeSettingsMenuId(modal.custom_id.split('.').slice(1))).toMatchObject({ ownerId, verb: 'importSubmit', target: '', page: 2 });
			expect(modal.title.length).toBeLessThanOrEqual(45);
			expect(description.type).toBe(ComponentType.TextDisplay);
			expect(file).toMatchObject({
				type: ComponentType.Label,
				component: { type: ComponentType.FileUpload, custom_id: SettingsImportFileInputId }
			});
			expect(file.component).toMatchObject({ required: false, max_values: 1 });
			expect(pasted).toMatchObject({
				type: ComponentType.Label,
				component: { type: ComponentType.TextInput, custom_id: SettingsImportTextInputId }
			});
			expect(pasted.component).toMatchObject({ required: false, max_length: 4000 });
			expect([file.label, pasted.label].every((label) => label.length <= 45)).toBe(true);
		});
	});

	describe('import submission', () => {
		const attachment = { id: '1300000000000000000', filename: 'wolfstar-settings.json', size: 512, url: 'https://cdn.discordapp.com/a.json' };

		// A submission as Discord sends it: the text display, then a label for the file upload and one for the text input:
		function submit(options: { files?: string[]; text?: string; resolved?: boolean }) {
			return {
				components: [
					{ type: ComponentType.TextDisplay, id: 1 },
					{
						type: ComponentType.Label,
						id: 2,
						component: { type: ComponentType.FileUpload, id: 3, custom_id: SettingsImportFileInputId, values: options.files ?? [] }
					},
					{
						type: ComponentType.Label,
						id: 4,
						component: { type: ComponentType.TextInput, id: 5, custom_id: SettingsImportTextInputId, value: options.text ?? '' }
					}
				],
				resolved: options.resolved === false ? undefined : { attachments: { [attachment.id]: attachment } }
			} as unknown as Parameters<typeof readSettingsImportSubmission>[0];
		}

		test('GIVEN a file THEN it is the attachment Discord resolved', () => {
			expect(readSettingsImportSubmission(submit({ files: [attachment.id] }))).toEqual({ type: 'file', attachment });
		});

		test('GIVEN pasted JSON THEN it is the text, without the blanks around it', () => {
			expect(readSettingsImportSubmission(submit({ text: '  {"version":1}\n' }))).toEqual({ type: 'text', text: '{"version":1}' });
		});

		test('GIVEN both THEN the file wins', () => {
			expect(readSettingsImportSubmission(submit({ files: [attachment.id], text: '{"version":1}' }))).toEqual({ type: 'file', attachment });
		});

		test('GIVEN a file Discord did not resolve THEN what was pasted is read instead', () => {
			expect(readSettingsImportSubmission(submit({ files: [attachment.id], text: '{}', resolved: false }))).toEqual({
				type: 'text',
				text: '{}'
			});
		});

		test('GIVEN nothing, or only blanks THEN there is nothing to import', () => {
			expect(readSettingsImportSubmission(submit({}))).toBeNull();
			expect(readSettingsImportSubmission(submit({ text: '   ' }))).toBeNull();
		});
	});

	describe('time zone', () => {
		test('GIVEN the time zone key THEN it is picked, not written', () => {
			expect(getSettingKind(getConfigurableKeys().get('timezone')!)).toBe('timezone');
		});

		test('GIVEN its modal THEN each group of zones is a select menu with nothing selected, and the current zone is told', () => {
			const context = createContext({ timezone: 'Europe/Rome' });
			const modal = renderSettingsModal(context, getConfigurableKeys().get('timezone')!, 0);
			const labels = modal.components as unknown as {
				label: string;
				description?: string;
				component: { custom_id: string; options: { value: string; default?: boolean }[]; required: boolean };
			}[];

			expect(labels).toHaveLength(5);
			expect(labels.map((entry) => entry.component.custom_id)).toEqual([
				'timezone.americas',
				'timezone.europe',
				'timezone.africa',
				'timezone.asia',
				'timezone.pacific'
			]);
			for (const entry of labels) {
				expect(entry.component.required).toBe(false);
				expect(entry.component.options.length).toBeLessThanOrEqual(25);
				expect(entry.component.options.some((option) => option.default)).toBe(false);
			}

			expect(labels[0].description).toContain('Europe/Rome');
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
			// A setting that is on or off is written with its checkbox:
			expect(display('modulesAutomod')).toBe('☑️ commands/conf:menuValueEnabled');
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
