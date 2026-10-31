import { applyConfigurationImport, ConfigurationImportStaleError } from '#lib/database/settings/transfer/apply';
import type { ParsedConfiguration } from '#lib/database/settings/transfer/parse';
import { encodeSettingsImportId, savePendingImport, type SettingsImportVerb } from '#lib/database/settings/transfer/pending';
import type { ConfigurationPlan } from '#lib/database/settings/transfer/plan';
import { canManageServerSettingsFrom } from '#lib/structures/commands/permissions';
import { UserInteractionHandler } from '#root/interaction-handlers/settingsImport';
import { container } from '@wolfstar/http-framework';

vi.mock('#lib/database/settings/transfer/apply', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/database/settings/transfer/apply')>()),
	applyConfigurationImport: vi.fn()
}));

// Echoes the key and its options, the translations are not what is tested here:
vi.mock('#lib/structures/commands/permissions', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/structures/commands/permissions')>()),
	canManageServerSettingsFrom: vi.fn()
}));
vi.mock('@wolfstar/plugin-i18next', async (importOriginal) => ({
	...(await importOriginal<typeof import('@wolfstar/plugin-i18next')>()),
	getSupportedUserLanguageT: () => (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)
}));

const guildId = '254360814063058944';
const ownerId = '266624760782258186';
const importId = '1300000000000000001';

const parsed: ParsedConfiguration = { settings: [], rules: [] };
const plan = (overrides: Partial<ConfigurationPlan> = {}): ConfigurationPlan => ({
	settings: [],
	rules: { create: [], update: [], remove: [], unchanged: 0 },
	isEmpty: false,
	...overrides
});

/**
 * A click on a button of the preview, which records what it is answered with.
 */
function click(verb: SettingsImportVerb, userId = ownerId) {
	const answers: [string, unknown][] = [];
	const interaction = {
		guildId,
		user: { id: userId },
		member: { user: { id: userId }, roles: [], permissions: '0' },
		reply: async (data: unknown) => void answers.push(['reply', data]),
		update: async (data: unknown) => void answers.push(['update', data]),
		deferUpdate: async () => {
			answers.push(['defer', null]);
			return { update: async (data: unknown) => void answers.push(['edit', data]) };
		}
	};
	const content = encodeSettingsImportId({ ownerId, verb, importId }).split('.').slice(1);
	return { interaction: interaction as never, content, answers };
}

describe('settingsImport interaction handler', () => {
	// The handlers are made as two processes would make them: neither holds anything of the other but Redis.
	const create = () =>
		new UserInteractionHandler(
			{ name: 'settingsImport', path: '/interaction-handlers/settingsImport.ts', root: '/', store: { name: 'interaction-handlers' } } as never,
			{}
		);

	const stored = new Map<string, string>();
	const redis = {
		set: async (key: string, value: string) => void stored.set(key, value),
		getdel: async (key: string) => {
			const value = stored.get(key) ?? null;
			stored.delete(key);
			return value;
		}
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
		stored.clear();
		vi.mocked(applyConfigurationImport).mockReset();
		vi.mocked(canManageServerSettingsFrom).mockReset().mockResolvedValue(true);
	});

	test('GIVEN an import that waits THEN a handler that never saw the command writes it, for who confirmed', async () => {
		vi.mocked(applyConfigurationImport).mockResolvedValue(plan({ settings: [{} as never] }));
		await savePendingImport(guildId, ownerId, importId, parsed);

		const { interaction, content, answers } = click('confirm');
		await create().run(interaction, content);

		expect(vi.mocked(applyConfigurationImport).mock.calls).toEqual([[guildId, parsed, ownerId]]);
		expect(answers.map(([kind]) => kind)).toEqual(['defer', 'edit']);
		expect(answers[1][1]).toMatchObject({ embeds: [], components: [] });
		expect((answers[1][1] as { content: string }).content).toContain('transferImportDone {"settings":1,"created":0,"updated":0,"moved":0');
	});

	test('GIVEN two clicks THEN the import is written once, and the second one is told it is gone', async () => {
		vi.mocked(applyConfigurationImport).mockResolvedValue(plan());
		await savePendingImport(guildId, ownerId, importId, parsed);

		const first = click('confirm');
		const second = click('confirm');
		await Promise.all([create().run(first.interaction, first.content), create().run(second.interaction, second.content)]);

		expect(applyConfigurationImport).toHaveBeenCalledTimes(1);
		expect(second.answers).toEqual([['update', { content: 'commands/conf:transferImportExpired', embeds: [], components: [] }]]);
	});

	test('GIVEN an import that expired THEN nothing is written and the buttons are taken away', async () => {
		const { interaction, content, answers } = click('confirm');
		await create().run(interaction, content);

		expect(applyConfigurationImport).not.toHaveBeenCalled();
		expect(answers).toEqual([['update', { content: 'commands/conf:transferImportExpired', embeds: [], components: [] }]]);
	});

	test('GIVEN the import is cancelled THEN it is forgotten, and a later confirmation finds nothing', async () => {
		await savePendingImport(guildId, ownerId, importId, parsed);

		const cancel = click('cancel');
		await create().run(cancel.interaction, cancel.content);
		expect(cancel.answers).toEqual([['update', { content: 'commands/conf:transferImportCancelled', embeds: [], components: [] }]]);
		expect(stored.size).toBe(0);

		const confirm = click('confirm');
		await create().run(confirm.interaction, confirm.content);
		expect(applyConfigurationImport).not.toHaveBeenCalled();
	});

	test('GIVEN a server that already is as the file says by then THEN the administrator is told nothing was done', async () => {
		vi.mocked(applyConfigurationImport).mockResolvedValue(plan({ isEmpty: true }));
		await savePendingImport(guildId, ownerId, importId, parsed);

		const { interaction, content, answers } = click('confirm');
		await create().run(interaction, content);

		expect(answers.at(-1)).toEqual(['edit', { content: 'commands/conf:transferNothing', embeds: [], components: [] }]);
	});

	test('GIVEN the file no longer fits the server THEN the administrator is told to run the command again', async () => {
		vi.mocked(applyConfigurationImport).mockRejectedValue(new ConfigurationImportStaleError());
		await savePendingImport(guildId, ownerId, importId, parsed);

		const { interaction, content, answers } = click('confirm');
		await create().run(interaction, content);

		expect(answers.at(-1)).toEqual(['edit', { content: 'commands/conf:transferImportStale', embeds: [], components: [] }]);
	});

	test('GIVEN an administrator a dashboard access rule keeps out THEN the import is left waiting', async () => {
		await savePendingImport(guildId, ownerId, importId, parsed);
		vi.mocked(canManageServerSettingsFrom).mockResolvedValue(false);

		const denied = click('confirm');
		await create().run(denied.interaction, denied.content);

		expect(denied.answers.map(([kind]) => kind)).toEqual(['reply']);
		expect(applyConfigurationImport).not.toHaveBeenCalled();
		expect(stored.size).toBe(1);
	});

	test('GIVEN another member, or an ID that is not of the preview, THEN the import is left waiting', async () => {
		await savePendingImport(guildId, ownerId, importId, parsed);

		const other = click('confirm', '1');
		await create().run(other.interaction, other.content);
		expect(other.answers.map(([kind]) => kind)).toEqual(['reply']);

		const broken = click('confirm');
		await create().run(broken.interaction, [ownerId, 'explode']);
		expect(broken.answers.map(([kind]) => kind)).toEqual(['reply']);

		expect(applyConfigurationImport).not.toHaveBeenCalled();
		expect(stored.size).toBe(1);
	});
});
