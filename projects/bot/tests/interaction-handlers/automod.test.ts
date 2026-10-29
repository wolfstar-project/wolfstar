import { writeSettings } from '#lib/database';
import { readAutoModerationRules } from '#lib/moderation/automod/rules';
import { encodeAutoModerationMenuId, type AutoModerationMenuVerb } from '#lib/structures/automod-menu';
import { canManageServerSettingsFrom, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { UserInteractionHandler } from '#root/interaction-handlers/automod';

vi.mock('#lib/database', async (original) => ({
	...(await original<typeof import('#lib/database')>()),
	writeSettings: vi.fn()
}));
vi.mock('#lib/moderation/automod/rules', async (original) => ({
	...(await original<typeof import('#lib/moderation/automod/rules')>()),
	readAutoModerationRules: vi.fn()
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
		{ name: 'automod', path: '/interaction-handlers/automod.ts', root: '/', store: { name: 'interaction-handlers' } } as never,
		{}
	);

function click(verb: AutoModerationMenuVerb, argument = '') {
	const answers: { reply: unknown[]; update: unknown[] } = { reply: [], update: [] };
	const interaction = {
		guildId,
		user: { id: ownerId },
		member: { user: { id: ownerId }, roles: [], permissions: '0' },
		data: {},
		reply: async (data: unknown) => void answers.reply.push(data),
		update: async (data: unknown) => void answers.update.push(data)
	};
	const content = encodeAutoModerationMenuId({ ownerId, verb, argument }).split('.').slice(1);
	return { interaction: interaction as never, content, answers };
}

describe('auto-moderation menu', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(readAutoModerationRules).mockResolvedValue([]);
	});

	test('GIVEN a member the dashboard lets in without the administrator level THEN they change the settings', async () => {
		vi.mocked(canManageServerSettingsFrom).mockResolvedValue(true);
		vi.mocked(hasCommandPermissionLevel).mockResolvedValue(false);

		const { interaction, content, answers } = click('setting', 'module');
		await handler().run(interaction, content);

		expect(writeSettings).toHaveBeenCalledOnce();
		expect(answers.reply).toEqual([]);
		expect(answers.update).toHaveLength(1);
	});

	test('GIVEN an administrator the dashboard keeps out THEN they cannot change the settings', async () => {
		vi.mocked(canManageServerSettingsFrom).mockResolvedValue(false);
		vi.mocked(hasCommandPermissionLevel).mockResolvedValue(true);

		const { interaction, content, answers } = click('setting', 'module');
		await handler().run(interaction, content);

		expect(writeSettings).not.toHaveBeenCalled();
		expect(answers.reply).toMatchObject([{ content: 'preconditions:administrator' }]);
	});

	test('GIVEN the rules THEN the administrator level decides, not the dashboard', async () => {
		vi.mocked(canManageServerSettingsFrom).mockResolvedValue(true);
		vi.mocked(hasCommandPermissionLevel).mockResolvedValue(false);

		const denied = click('list');
		await handler().run(denied.interaction, denied.content);
		expect(denied.answers.reply).toMatchObject([{ content: 'preconditions:administrator' }]);

		vi.mocked(hasCommandPermissionLevel).mockResolvedValue(true);
		const allowed = click('list');
		await handler().run(allowed.interaction, allowed.content);
		expect(allowed.answers.update).toHaveLength(1);
		expect(canManageServerSettingsFrom).not.toHaveBeenCalled();
	});
});
