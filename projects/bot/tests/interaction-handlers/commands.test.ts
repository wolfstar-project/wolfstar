import { readSettings, writeSettingsTransaction } from '#lib/database';
import { encodeCommandsMenuId, findCommandRestriction, getCommandRestrictionRevision, type CommandsMenuVerb } from '#lib/structures/commands-menu';
import { getLegacyPermissionRevision } from '#lib/structures/commands-menu/legacy';
import { findCommandPiece } from '#lib/structures/commands-menu/disabled';
import { hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { UserInteractionHandler } from '#root/interaction-handlers/commands';
import { ModalSubmitInteraction, container } from '@wolfstar/http-framework';
import { getDefaultGuildSettings, type GuildData } from 'wolfstar-database';

vi.mock('#lib/database', async (original) => ({
	...(await original<typeof import('#lib/database')>()),
	readSettings: vi.fn(),
	writeSettingsTransaction: vi.fn()
}));
vi.mock('#lib/structures/commands-menu/disabled', async (original) => ({
	...(await original<typeof import('#lib/structures/commands-menu/disabled')>()),
	findCommandPiece: vi.fn()
}));
vi.mock('#lib/structures/commands/permissions', async (original) => ({
	...(await original<typeof import('#lib/structures/commands/permissions')>()),
	hasCommandPermissionLevel: vi.fn()
}));
vi.mock('@wolfstar/http-framework', async (original) => ({
	...(await original<typeof import('@wolfstar/http-framework')>()),
	ModalSubmitInteraction: class {}
}));
vi.mock('@wolfstar/plugin-i18next', async (original) => ({
	...(await original<typeof import('@wolfstar/plugin-i18next')>()),
	getSupportedUserLanguageT: () => (key: string) => key
}));

const ownerId = '266624760782258186';
const guildId = '254360814063058944';
const userId = '666666666666666666';
const channelId = '111111111111111111';
const handler = () =>
	new UserInteractionHandler(
		{ name: 'commands', path: '/interaction-handlers/commands.ts', root: '/', store: { name: 'interaction-handlers' } } as never,
		{}
	);

function submit(verb: CommandsMenuVerb, revision: number, values: Record<string, string | string[]>, actorId = ownerId) {
	const answers: unknown[] = [];
	const interaction = Object.assign(Object.create(ModalSubmitInteraction.prototype), {
		guildId,
		user: { id: actorId },
		member: { user: { id: actorId }, roles: [], permissions: '0' },
		data: {
			components: Object.entries(values).map(([custom_id, value]) => ({ custom_id, ...(Array.isArray(value) ? { values: value } : { value }) }))
		},
		reply: async (data: unknown) => void answers.push(data)
	});
	const content = encodeCommandsMenuId({ ownerId, verb, target: 'ban', page: revision }).split('.').slice(1);
	return { interaction, content, answers };
}

describe('commands editor', () => {
	const stored = { ...findCommandRestriction([], 'ban'), allowedUsers: [userId], ignoredChannels: [channelId] };
	// The handler reads and writes the settings through the mocks, which change this object in place:
	let settings: GuildData;
	const written: Record<string, unknown>[] = [];
	beforeEach(() => {
		written.length = 0;
		vi.clearAllMocks();
		settings = {
			...getDefaultGuildSettings()!,
			id: guildId,
			commandsRestrictions: [stored] as unknown as GuildData['commandsRestrictions'],
			commandsDisabled: ['ban']
		} as GuildData;
		vi.mocked(readSettings).mockImplementation(async () => settings as never);
		vi.mocked(hasCommandPermissionLevel).mockResolvedValue(true);
		vi.mocked(findCommandPiece).mockReturnValue({ name: 'ban' } as never);
		vi.mocked(writeSettingsTransaction).mockImplementation(
			async () =>
				({
					settings,
					write(data: Record<string, unknown>) {
						written.push(data);
						Object.assign(settings, data);
						return this;
					},
					submitWithAudit: vi.fn(),
					[Symbol.dispose]() {}
				}) as never
		);
	});

	test('saving channels preserves users, and saving access preserves disabled status and channels', async () => {
		const channels = submit('save', getCommandRestrictionRevision(stored, true), { status: 'enabled', allowedChannels: [], ignoredChannels: [] });
		await handler().run(channels.interaction, channels.content);
		expect(written[0]).toMatchObject({ commandsDisabled: [], commandsRestrictions: [{ ...stored, ignoredChannels: [] }] });

		const current = findCommandRestriction(settings.commandsRestrictions as never, 'ban');
		settings.commandsDisabled = ['ban'];
		const access = submit('saveAccess', getCommandRestrictionRevision(current, true), {
			allowedUsers: [],
			ignoredUsers: [userId],
			allowedRoles: [],
			ignoredRoles: []
		});
		await handler().run(access.interaction, access.content);
		expect(written[1]).toMatchObject({
			commandsDisabled: ['ban'],
			commandsRestrictions: [{ ...current, allowedUsers: [], ignoredUsers: [userId] }]
		});
	});

	test('a form opened before another save cannot overwrite the new rules', async () => {
		const stale = submit('saveAccess', getCommandRestrictionRevision({ ...stored, allowedUsers: [] }, true), {
			allowedUsers: [],
			ignoredUsers: []
		});
		await handler().run(stale.interaction, stale.content);
		expect(written).toEqual([]);
		expect(stale.answers).toMatchObject([{ content: 'commands/commands:editStale' }]);
	});

	test('a non-administrator or another menu user cannot save access', async () => {
		vi.mocked(hasCommandPermissionLevel).mockResolvedValue(false);
		const denied = submit('saveAccess', getCommandRestrictionRevision(stored, true), {});
		await handler().run(denied.interaction, denied.content);
		const other = submit('saveAccess', getCommandRestrictionRevision(stored, true), {}, userId);
		await handler().run(other.interaction, other.content);
		expect(written).toEqual([]);
		expect(denied.answers).toMatchObject([{ content: 'preconditions:administrator' }]);
		expect(other.answers).toMatchObject([{ content: 'commands/commands:menuWrongUser' }]);
	});

	test('protected commands cannot receive user restrictions', async () => {
		vi.mocked(findCommandPiece).mockReturnValue({ name: 'commands' } as never);
		const denied = submit('saveAccess', 0, { allowedUsers: [userId] });
		await handler().run(denied.interaction, denied.content);
		expect(written).toEqual([]);
		expect(denied.answers).toMatchObject([{ content: 'commands/commands:editProtectedRestricted' }]);
	});

	test('legacy removal requires the owner, exact confirmation and the downloaded revision', async () => {
		// The tests have no gateway: the owner of the guild comes from a stand-in client.
		const fetch = vi.fn().mockResolvedValue({ ownerId });
		const gatewayClient = container.gatewayClient;
		container.gatewayClient = { guilds: { fetch } } as never;
		onTestFinished(() => {
			container.gatewayClient = gatewayClient;
		});
		settings.permissionsUsers = [{ id: userId, allow: [], deny: ['*'] }];
		const revision = getLegacyPermissionRevision(settings);
		const invalid = submit('confirmLegacy', revision, { confirmation: 'remove' });
		await handler().run(invalid.interaction, invalid.content);
		expect(invalid.answers).toMatchObject([{ content: 'commands/commands:legacyConfirmationInvalid' }]);
		const stale = submit('confirmLegacy', revision + 1, { confirmation: 'REMOVE' });
		await handler().run(stale.interaction, stale.content);
		expect(stale.answers).toMatchObject([{ content: 'commands/commands:legacyStale' }]);
		fetch.mockResolvedValueOnce({ ownerId: userId } as never);
		const nonOwner = submit('confirmLegacy', revision, { confirmation: 'REMOVE' });
		await handler().run(nonOwner.interaction, nonOwner.content);
		expect(nonOwner.answers).toMatchObject([{ content: 'commands/commands:legacyOwnerOnly' }]);
		expect(written).toEqual([]);
		const confirmed = submit('confirmLegacy', revision, { confirmation: 'REMOVE' });
		await handler().run(confirmed.interaction, confirmed.content);
		expect(written).toEqual([{ permissionsUsers: [], permissionsRoles: [] }]);
		expect(settings.commandsRestrictions).toEqual([stored]);
	});
});
