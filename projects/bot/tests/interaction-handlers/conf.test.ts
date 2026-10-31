import { readSettings, writeSettings } from '#lib/database';
import { encodeSettingsMenuId, ModulesGroupPath } from '#lib/structures/settings-menu';
import { canManageServerSettingsFrom, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { UserInteractionHandler } from '#root/interaction-handlers/conf';
import { container } from '@wolfstar/http-framework';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', async (original) => ({
	...(await original<typeof import('#lib/database')>()),
	readSettings: vi.fn(),
	writeSettings: vi.fn()
}));
vi.mock('#lib/structures/commands/permissions', async (original) => ({
	...(await original<typeof import('#lib/structures/commands/permissions')>()),
	canManageServerSettingsFrom: vi.fn(),
	hasCommandPermissionLevel: vi.fn()
}));
vi.mock('@wolfstar/plugin-i18next', async (original) => ({
	...(await original<typeof import('@wolfstar/plugin-i18next')>()),
	getSupportedUserLanguageT: () => (key: string) => key
}));

const ownerId = '266624760782258186';
const guildId = '254360814063058944';
const handler = () =>
	new UserInteractionHandler(
		{ name: 'conf', path: '/interaction-handlers/conf.ts', root: '/', store: { name: 'interaction-handlers' } } as never,
		{}
	);

function click() {
	const answers: unknown[] = [];
	const modals: unknown[] = [];
	const interaction = {
		guildId,
		user: { id: ownerId },
		member: { user: { id: ownerId }, roles: [], permissions: '0' },
		data: {},
		reply: async (data: unknown) => void answers.push(data),
		showModal: async (data: unknown) => void modals.push(data)
	};
	const content = encodeSettingsMenuId({ ownerId, verb: 'import', target: '', page: 0 }).split('.').slice(1);
	return { interaction: interaction as never, content, answers, modals };
}

describe('conf interaction handler', () => {
	beforeEach(() => {
		vi.mocked(canManageServerSettingsFrom).mockResolvedValue(true);
	});

	test('GIVEN a member the dashboard lets in without the administrator level THEN the import is not offered', async () => {
		vi.mocked(hasCommandPermissionLevel).mockResolvedValue(false);
		const { interaction, content, answers, modals } = click();

		await handler().run(interaction, content);

		expect(modals).toEqual([]);
		expect(answers).toMatchObject([{ content: 'preconditions:administrator' }]);
	});

	test('GIVEN an administrator THEN the import opens', async () => {
		vi.mocked(hasCommandPermissionLevel).mockResolvedValue(true);
		const { interaction, content, modals } = click();

		await handler().run(interaction, content);

		expect(modals).toHaveLength(1);
	});

	test('GIVEN the switch of the appeals on the page of the modules THEN it is flipped and that page is shown again', async () => {
		vi.mocked(hasCommandPermissionLevel).mockResolvedValue(true);
		vi.mocked(readSettings).mockResolvedValue({ ...getDefaultGuildSettings(), id: guildId, appealsEnabled: false } as ReadonlyGuildData);
		container.gatewayClient = { guilds: { fetch: async () => ({ id: guildId, name: 'WolfStar' }) } } as never;

		const updates: { components: unknown[] }[] = [];
		const interaction = {
			guildId,
			user: { id: ownerId },
			member: { user: { id: ownerId }, roles: [], permissions: '0' },
			data: {},
			reply: async () => undefined,
			update: async (data: { components: unknown[] }) => void updates.push(data)
		};
		const content = encodeSettingsMenuId({ ownerId, verb: 'moduleToggle', target: 'appealsEnabled', page: 1 }).split('.').slice(1);

		await handler().run(interaction as never, content);

		const [writtenGuildId, getData] = vi.mocked(writeSettings).mock.lastCall as unknown as [string, (settings: ReadonlyGuildData) => unknown];
		expect(writtenGuildId).toBe(guildId);
		expect(getData({ appealsEnabled: false } as ReadonlyGuildData)).toEqual({ appealsEnabled: true });
		// The select menu of the modules marks the page that is shown:
		expect(JSON.stringify(updates[0].components)).toContain(`"value":"${ModulesGroupPath}","emoji":`);
		expect(JSON.stringify(updates[0].components)).toMatch(new RegExp(`"value":"${ModulesGroupPath}"[^}]*}[^}]*"default":true`));
	});
});
