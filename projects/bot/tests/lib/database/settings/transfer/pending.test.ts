import { findPortableKey } from '#lib/database/settings/transfer/format';
import type { ParsedConfiguration } from '#lib/database/settings/transfer/parse';
import {
	decodeSettingsImportId,
	encodeSettingsImportId,
	PendingImportSeconds,
	renderSettingsImportButtons,
	savePendingImport,
	takePendingImport
} from '#lib/database/settings/transfer/pending';
import { container } from '@wolfstar/http-framework';
import { ButtonStyle } from 'discord-api-types/v10';
import { getDefaultAutoModerationRule } from 'wolfstar-database';

const guildId = '254360814063058944';
const ownerId = '266624760782258186';
const importId = '1300000000000000001';

// Echoes the key, the translations are not what is tested here:
const t = ((key: string) => key) as never;

describe('pending import', () => {
	describe('custom IDs', () => {
		test('GIVEN an action THEN it survives the round trip the framework parser does', () => {
			const action = { ownerId, verb: 'confirm', importId } as const;
			const id = encodeSettingsImportId(action);

			expect(id).toBe(`settingsImport.${ownerId}.confirm:${importId}`);
			expect(id.length).toBeLessThanOrEqual(100);
			expect(decodeSettingsImportId(id.split('.').slice(1))).toEqual(action);
		});

		test('GIVEN something else THEN it decodes to null', () => {
			expect(decodeSettingsImportId(null)).toBeNull();
			expect(decodeSettingsImportId([ownerId, `explode:${importId}`])).toBeNull();
			expect(decodeSettingsImportId([ownerId, 'confirm'])).toBeNull();
			expect(decodeSettingsImportId([ownerId, 'confirm:*'])).toBeNull();
			expect(decodeSettingsImportId([ownerId, 'confirm:12'])).toBeNull();
		});

		test('GIVEN the buttons THEN one confirms the import and the other cancels it, both of that import', () => {
			const { components } = renderSettingsImportButtons(t, ownerId, importId);
			const actions = components.map((button) => decodeSettingsImportId(('custom_id' in button ? button.custom_id : '').split('.').slice(1)));

			expect(actions).toEqual([
				{ ownerId, verb: 'confirm', importId },
				{ ownerId, verb: 'cancel', importId }
			]);
			expect(components.map((button) => button.style)).toEqual([ButtonStyle.Primary, ButtonStyle.Secondary]);
		});
	});

	describe('storage', () => {
		// One Redis for every process, which is the point of keeping the import there:
		const stored = new Map<string, { value: string; seconds: number }>();
		const redis = {
			set: async (key: string, value: string, _mode: string, seconds: number) => void stored.set(key, { value, seconds }),
			getdel: async (key: string) => {
				const entry = stored.get(key);
				stored.delete(key);
				return entry?.value ?? null;
			}
		};
		let previous: unknown;
		let parsed: ParsedConfiguration;

		beforeAll(() => {
			previous = (container as any).redis;
			(container as any).redis = redis;

			const { ignoredRoles: _roles, ignoredChannels: _channels, ...rule } = getDefaultAutoModerationRule('Words');
			parsed = {
				settings: [{ key: findPortableKey('modules.moderation')!, value: false }],
				rules: [{ ...rule, name: 'Words', options: { words: ['spam'] } }]
			};
		});

		afterAll(() => {
			(container as any).redis = previous;
		});

		beforeEach(() => stored.clear());

		test('GIVEN an import that waits THEN it is kept for five minutes, as data', async () => {
			await savePendingImport(guildId, ownerId, importId, parsed);

			const [[key, entry]] = [...stored.entries()];
			expect(key).toBe(`wolfstar:settings:import:${guildId}:${ownerId}:${importId}`);
			expect(entry.seconds).toBe(PendingImportSeconds);
			expect(entry.seconds).toBe(300);
			expect(JSON.parse(entry.value)).toEqual({ settings: [['modules.moderation', false]], rules: parsed.rules });
		});

		test('GIVEN an import that waits THEN it is taken as it was read, with the keys of its settings, and only once', async () => {
			await savePendingImport(guildId, ownerId, importId, parsed);

			const taken = await takePendingImport(guildId, ownerId, importId);
			expect(taken).toEqual(parsed);
			expect(taken?.settings[0].key).toBe(findPortableKey('modules.moderation'));
			await expect(takePendingImport(guildId, ownerId, importId)).resolves.toBeNull();
		});

		test('GIVEN an import that waits THEN it is of its server, its administrator and its preview', async () => {
			await savePendingImport(guildId, ownerId, importId, parsed);

			await expect(takePendingImport('1', ownerId, importId)).resolves.toBeNull();
			await expect(takePendingImport(guildId, '2', importId)).resolves.toBeNull();
			await expect(takePendingImport(guildId, ownerId, '1300000000000000002')).resolves.toBeNull();
			await expect(takePendingImport(guildId, ownerId, importId)).resolves.toEqual(parsed);
		});

		test('GIVEN two imports of an administrator THEN each preview confirms its own file', async () => {
			const other = { settings: [], rules: null };
			await savePendingImport(guildId, ownerId, importId, parsed);
			await savePendingImport(guildId, ownerId, '1300000000000000002', other);

			await expect(takePendingImport(guildId, ownerId, importId)).resolves.toEqual(parsed);
			await expect(takePendingImport(guildId, ownerId, '1300000000000000002')).resolves.toEqual(other);
		});

		test('GIVEN a setting the bot no longer carries THEN the import is gone, it is not written without it', async () => {
			const key = `wolfstar:settings:import:${guildId}:${ownerId}:${importId}`;
			stored.set(key, { value: JSON.stringify({ settings: [['modules.nope', true]], rules: null }), seconds: 300 });

			await expect(takePendingImport(guildId, ownerId, importId)).resolves.toBeNull();
			expect(stored.has(key)).toBe(false);
		});
	});
});
