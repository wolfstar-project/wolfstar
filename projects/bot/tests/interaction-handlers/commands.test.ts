import { readSettings, writeSettingsTransaction } from '#lib/database';
import {
	decodeCommandsMenuId,
	encodeCommandsMenuId,
	findCommandRestriction,
	getCommandRestrictionRevision,
	type CommandsMenuVerb
} from '#lib/structures/commands-menu';
import { getLegacyPermissionRevision } from '#lib/structures/commands-menu/legacy';
import { findCommandPiece } from '#lib/structures/commands-menu/disabled';
import { canManageServerSettingsFrom } from '#lib/structures/commands/permissions';
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
	canManageServerSettingsFrom: vi.fn()
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

const roleId = '777777777777777777';
// A select menu of roles and users returns IDs, and the interaction says which are roles and which users:
const resolved = { users: { [userId]: { id: userId } }, roles: { [roleId]: { id: roleId } } };

function submit(verb: CommandsMenuVerb, revision: number, values: Record<string, string | string[]>, actorId = ownerId, target = 'ban') {
	const answers: unknown[] = [];
	const interaction = Object.assign(Object.create(ModalSubmitInteraction.prototype), {
		guildId,
		user: { id: actorId },
		member: { user: { id: actorId }, roles: [], permissions: '0' },
		data: {
			resolved,
			components: Object.entries(values).map(([custom_id, value]) => ({ custom_id, ...(Array.isArray(value) ? { values: value } : { value }) }))
		},
		reply: async (data: unknown) => void answers.push(data)
	});
	const content = encodeCommandsMenuId({ ownerId, verb, target, page: revision }).split('.').slice(1);
	return { interaction, content, answers };
}

/** A click on a component of the menu, a button or a select menu with its picked values. */
function click(verb: CommandsMenuVerb, target: string, values?: string[]) {
	const answers: unknown[] = [];
	const modals: { custom_id: string; components: unknown[] }[] = [];
	const interaction = {
		guildId,
		user: { id: ownerId },
		member: { user: { id: ownerId }, roles: [], permissions: '0' },
		data: values === undefined ? { component_type: 2 } : { component_type: 3, values },
		reply: async (data: unknown) => void answers.push(data),
		showModal: async (data: { custom_id: string; components: unknown[] }) => void modals.push(data),
		defer: async () => ({ update: async (data: unknown) => void answers.push(data) })
	};
	const content = encodeCommandsMenuId({ ownerId, verb, target, page: 0 }).split('.').slice(1);
	return { interaction: interaction as never, content, answers, modals };
}

function decodeTarget(customId: string) {
	return decodeCommandsMenuId(customId.split('.').slice(1));
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
			commandsRestrictions: [stored, { format: 2 }] as unknown as GuildData['commandsRestrictions'],
			commandsDisabled: ['ban']
		} as GuildData;
		vi.mocked(readSettings).mockImplementation(async () => settings as never);
		vi.mocked(canManageServerSettingsFrom).mockResolvedValue(true);
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

	test('saving splits the roles and the users of a rule and keeps the channels it picked', async () => {
		const save = submit('save', getCommandRestrictionRevision(stored, true), {
			status: 'enabled',
			allowedChannels: [channelId],
			ignoredChannels: [],
			allowedMembers: [roleId, userId],
			ignoredMembers: []
		});
		await handler().run(save.interaction, save.content);
		expect(written[0]).toMatchObject({
			commandsDisabled: [],
			commandsRestrictions: [
				{ ...stored, allowedChannels: [channelId], ignoredChannels: [], allowedRoles: [roleId], allowedUsers: [userId] },
				{ format: 2 }
			]
		});
	});

	test('a member the interaction does not resolve is left out', async () => {
		const save = submit('save', getCommandRestrictionRevision(stored, true), {
			status: 'disabled',
			allowedChannels: [],
			ignoredChannels: [channelId],
			allowedMembers: ['888888888888888888'],
			ignoredMembers: [userId]
		});
		await handler().run(save.interaction, save.content);
		expect(written[0]).toMatchObject({
			commandsDisabled: ['ban'],
			commandsRestrictions: [{ ...stored, allowedUsers: [], allowedRoles: [], ignoredUsers: [userId], ignoredRoles: [] }, { format: 2 }]
		});
	});

	test('a form opened before another save cannot overwrite the new rules', async () => {
		const stale = submit('save', getCommandRestrictionRevision({ ...stored, allowedUsers: [] }, true), { status: 'enabled' });
		await handler().run(stale.interaction, stale.content);
		expect(written).toEqual([]);
		expect(stale.answers).toMatchObject([{ content: 'commands/commands:editStale' }]);
	});

	test('a non-administrator or another menu user cannot save', async () => {
		vi.mocked(canManageServerSettingsFrom).mockResolvedValue(false);
		const denied = submit('save', getCommandRestrictionRevision(stored, true), { status: 'enabled' });
		await handler().run(denied.interaction, denied.content);
		const other = submit('save', getCommandRestrictionRevision(stored, true), { status: 'enabled' }, userId);
		await handler().run(other.interaction, other.content);
		expect(written).toEqual([]);
		expect(denied.answers).toMatchObject([{ content: 'preconditions:administrator' }]);
		expect(other.answers).toMatchObject([{ content: 'commands/commands:menuWrongUser' }]);
	});

	test('protected commands cannot receive user restrictions', async () => {
		vi.mocked(findCommandPiece).mockReturnValue({ name: 'commands' } as never);
		const denied = submit('save', 0, { status: 'enabled', allowedMembers: [userId] });
		await handler().run(denied.interaction, denied.content);
		expect(written).toEqual([]);
		expect(denied.answers).toMatchObject([{ content: 'commands/commands:editProtectedRestricted' }]);
	});

	test('the rules of a category and of a sub-category open in a form of their own', async () => {
		const group = click('editGroup', 'Moderation.*');
		await handler().run(group.interaction, group.content);
		expect(decodeTarget(group.modals[0].custom_id)).toMatchObject({ verb: 'save', target: 'Moderation.*' });

		const subCategory = click('editGroup', 'Moderation', ['Management']);
		await handler().run(subCategory.interaction, subCategory.content);
		expect(decodeTarget(subCategory.modals[0].custom_id)).toMatchObject({ verb: 'save', target: 'Moderation.Management.*' });
	});

	test('saving the form of a category writes its rule and its status', async () => {
		const save = submit(
			'save',
			getCommandRestrictionRevision(findCommandRestriction([], 'Moderation.*'), false),
			{ status: 'disabled', allowedChannels: [], ignoredChannels: [], allowedMembers: [], ignoredMembers: [roleId] },
			ownerId,
			'Moderation.*'
		);
		await handler().run(save.interaction, save.content);

		expect(written).toEqual([
			{
				commandsDisabled: ['ban', 'Moderation.*'],
				commandsRestrictions: [stored, { ...findCommandRestriction([], 'Moderation.*'), ignoredRoles: [roleId] }, { format: 2 }]
			}
		]);
	});

	test('saving the form of a sub-category with nothing picked removes its rule', async () => {
		const rule = { ...findCommandRestriction([], 'Moderation.Management.*'), ignoredUsers: [userId] };
		settings.commandsRestrictions = [stored, rule, { format: 2 }] as never;
		const save = submit(
			'save',
			getCommandRestrictionRevision(rule, false),
			{ status: 'enabled', allowedChannels: [], ignoredChannels: [], allowedMembers: [], ignoredMembers: [] },
			ownerId,
			'Moderation.Management.*'
		);
		await handler().run(save.interaction, save.content);

		expect(written).toMatchObject([{ commandsRestrictions: [stored, { format: 2 }] }]);
	});

	test('the file of the legacy nodes says why each one was left', async () => {
		const gatewayClient = container.gatewayClient;
		container.gatewayClient = { roles: { fetchAll: vi.fn().mockResolvedValue([]) } } as never;
		onTestFinished(() => {
			container.gatewayClient = gatewayClient;
		});
		settings.permissionsUsers = [{ id: userId, allow: [], deny: ['nosuchcommand'] }];

		const legacy = click('legacy', '');
		await handler().run(legacy.interaction, legacy.content);

		const [answer] = legacy.answers as { files: { data: Buffer }[] }[];
		expect(JSON.parse(answer.files[0].data.toString())).toEqual({
			users: [{ id: userId, allow: [], deny: ['nosuchcommand'], reason: 'unknownCommand' }],
			roles: []
		});
	});

	test('legacy removal requires the owner, exact confirmation and the downloaded revision', async () => {
		// The tests have no gateway: the owner of the guild comes from a stand-in client.
		const fetch = vi.fn().mockResolvedValue({ ownerId });
		const gatewayClient = container.gatewayClient;
		container.gatewayClient = { guilds: { fetch } } as never;
		onTestFinished(() => {
			container.gatewayClient = gatewayClient;
		});
		// The dashboard access rules share the columns, and removing the nodes keeps them:
		const ownRule = { id: ownerId, allow: [], deny: [], dashboard: 'deny' } as const;
		const roleRule = { id: '254360814063058945', allow: [], deny: [], dashboard: 'allow' } as const;
		settings.permissionsUsers = [{ id: userId, allow: [], deny: ['*'] }, ownRule];
		settings.permissionsRoles = [roleRule];
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
		expect(written).toEqual([{ permissionsUsers: [ownRule], permissionsRoles: [roleRule] }]);
		expect(settings.commandsRestrictions).toEqual([stored, { format: 2 }]);
	});
});
