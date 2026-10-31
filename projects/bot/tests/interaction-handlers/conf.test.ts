import { encodeSettingsMenuId } from '#lib/structures/settings-menu';
import { canManageServerSettingsFrom, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { UserInteractionHandler } from '#root/interaction-handlers/conf';

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
});
