import { fetchUserReportEnabled } from '#lib/database';
import { ModerationActions } from '#lib/moderation/actions/index';
import { catchHoneypotMessage, HoneypotDeleteMessageSeconds } from '#lib/moderation/honeypot/catch';
import { renderHoneypotLog } from '#lib/moderation/honeypot/log';
import { recordSharedBan } from '#lib/moderation/joinguard/log';
import type { GuildMessage } from '#lib/types';
import { Events } from '#lib/types/Enums';
import { isModerator } from '#utils/functions';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

const { unlock } = vi.hoisted(() => ({ unlock: vi.fn() }));

vi.mock('#lib/moderation/actions/index', () => ({
	ModerationActions: { kick: { apply: vi.fn() }, softban: { apply: vi.fn() }, ban: { apply: vi.fn() } }
}));
vi.mock('#lib/moderation/common', () => ({ fetchGuildT: vi.fn(async () => (key: string) => key) }));
vi.mock('#lib/moderation/honeypot/log', () => ({ renderHoneypotLog: vi.fn(() => 'log') }));
vi.mock('#lib/database', () => ({ fetchUserReportEnabled: vi.fn() }));
vi.mock('#lib/moderation/joinguard/log', () => ({ recordSharedBan: vi.fn(async () => undefined) }));
vi.mock('#utils/functions', () => ({ isModerator: vi.fn(), getModeration: vi.fn(async () => ({ createLock: () => unlock })) }));

const guildId = '254360814063058944';
const channelId = '254360814063058945';
const logChannelId = '254360814063058947';
const messageId = '254360814063058946';
const userId = '266624760782258186';

const guild = { id: guildId };
const author = { id: userId, toJSON: () => ({ id: userId, username: 'spammer', discriminator: '0', avatar: null, global_name: null }) };

function createMessage(overrides: Record<string, unknown> = {}) {
	return {
		id: messageId,
		guildId,
		channelId,
		guild,
		author,
		member: { id: userId, guildId },
		content: 'free nitro',
		attachments: new Map([['1', { url: 'https://cdn.discordapp.com/a.png' }]]),
		...overrides
	} as unknown as GuildMessage;
}

function createSettings(overrides: Partial<ReadonlyGuildData> = {}) {
	return {
		...getDefaultGuildSettings()!,
		id: guildId,
		honeypotChannel: channelId,
		honeypotLogChannel: logChannelId,
		...overrides
	} as ReadonlyGuildData;
}

describe('catchHoneypotMessage', () => {
	const deleteMessage = vi.fn(async () => undefined);
	const emit = vi.fn();

	// A member is claimed for a minute by the process when Redis is not there, so each test starts after the claims of
	// the one before it ended:
	let now = Date.UTC(2026, 0, 1);

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime((now += 61_000));
		vi.mocked(isModerator).mockResolvedValue(false);
		vi.mocked(fetchUserReportEnabled).mockResolvedValue(true);
		for (const action of [ModerationActions.kick, ModerationActions.softban, ModerationActions.ban]) {
			vi.mocked(action.apply).mockResolvedValue({ id: 7 } as never);
		}

		Object.assign(container, { gatewayClient: { messages: { delete: deleteMessage } }, client: { emit }, redis: undefined });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// The log is rendered when the channel it goes to can be written in, so the test renders it as the listener would:
	function readCatch() {
		expect(emit).toHaveBeenCalledWith(Events.GuildMessageLog, guild, logChannelId, 'honeypotLogChannel', expect.any(Function));
		(emit.mock.calls[0][4] as () => unknown)();
		return vi.mocked(renderHoneypotLog).mock.calls[0][1];
	}

	test('GIVEN a member THEN the message is deleted, they are softbanned and the catch is reported with its case', async () => {
		await catchHoneypotMessage(createMessage(), createSettings());

		expect(deleteMessage).toHaveBeenCalledWith(channelId, messageId, 'Honeypot');
		expect(ModerationActions.softban.apply).toHaveBeenCalledWith(
			guild,
			{ user: author, reason: 'events/moderation:honeypot' },
			{ sendDirectMessage: true, context: HoneypotDeleteMessageSeconds }
		);
		expect(ModerationActions.kick.apply).not.toHaveBeenCalled();
		expect(ModerationActions.ban.apply).not.toHaveBeenCalled();
		expect(unlock).toHaveBeenCalledTimes(1);
		expect(readCatch()).toEqual({
			action: 'Softban',
			user: author.toJSON(),
			channelId,
			content: 'free nitro',
			attachments: 1,
			caseId: 7,
			error: undefined
		});
	});

	test('GIVEN a softban THEN it deletes what the member sent in the last hour', () => {
		expect(HoneypotDeleteMessageSeconds).toBe(3600);
	});

	test('GIVEN the action of the server THEN it is the one taken', async () => {
		await catchHoneypotMessage(createMessage(), createSettings({ honeypotAction: 'Kick' }));
		vi.setSystemTime((now += 61_000));
		await catchHoneypotMessage(createMessage(), createSettings({ honeypotAction: 'Ban' }));

		expect(ModerationActions.kick.apply).toHaveBeenCalledWith(guild, expect.anything(), { sendDirectMessage: true });
		expect(ModerationActions.ban.apply).toHaveBeenCalledWith(guild, expect.anything(), {
			sendDirectMessage: true,
			context: HoneypotDeleteMessageSeconds
		});
		expect(ModerationActions.softban.apply).not.toHaveBeenCalled();
	});

	test('GIVEN a softban or a ban THEN the account goes on the shared ban list, a kick does not', async () => {
		await catchHoneypotMessage(createMessage(), createSettings());
		expect(recordSharedBan).toHaveBeenCalledWith({ guildId, userId, caseId: 7, source: 'Honeypot' });

		vi.mocked(recordSharedBan).mockClear();
		vi.setSystemTime((now += 61_000));
		await catchHoneypotMessage(createMessage(), createSettings({ honeypotAction: 'Kick' }));
		expect(recordSharedBan).not.toHaveBeenCalled();
	});

	test('GIVEN an action that could not be taken THEN nothing goes on the shared ban list', async () => {
		vi.mocked(ModerationActions.softban.apply).mockRejectedValue(new Error('boom'));
		Object.assign(container, { logger: { error: vi.fn() } });

		await catchHoneypotMessage(createMessage(), createSettings());

		expect(recordSharedBan).not.toHaveBeenCalled();
	});

	test('GIVEN a moderator THEN nothing is done, not even to the message', async () => {
		vi.mocked(isModerator).mockResolvedValue(true);

		await catchHoneypotMessage(createMessage(), createSettings());

		expect(deleteMessage).not.toHaveBeenCalled();
		expect(ModerationActions.softban.apply).not.toHaveBeenCalled();
		expect(emit).not.toHaveBeenCalled();
	});

	test('GIVEN a message without its member THEN nobody is caught by guess', async () => {
		await catchHoneypotMessage(createMessage({ member: null }), createSettings());

		expect(isModerator).not.toHaveBeenCalled();
		expect(deleteMessage).not.toHaveBeenCalled();
		expect(ModerationActions.softban.apply).not.toHaveBeenCalled();
	});

	test('GIVEN a server that does not tell who is caught THEN no direct message is sent', async () => {
		await catchHoneypotMessage(createMessage(), createSettings({ honeypotDirectMessage: false }));

		expect(fetchUserReportEnabled).not.toHaveBeenCalled();
		expect(vi.mocked(ModerationActions.softban.apply).mock.calls[0][2]).toMatchObject({ sendDirectMessage: false });
	});

	test('GIVEN a user who turned the moderation direct messages off THEN none is sent', async () => {
		vi.mocked(fetchUserReportEnabled).mockResolvedValue(false);

		await catchHoneypotMessage(createMessage(), createSettings());

		expect(vi.mocked(ModerationActions.softban.apply).mock.calls[0][2]).toMatchObject({ sendDirectMessage: false });
	});

	test('GIVEN an action Discord refuses THEN the message is still deleted and the failure is reported with why', async () => {
		const error = new DiscordAPIError({ code: 50013, message: 'Missing Permissions' }, 50013, 403, 'PUT', 'https://discord.com', {});
		vi.mocked(ModerationActions.softban.apply).mockRejectedValue(error);

		await catchHoneypotMessage(createMessage(), createSettings());

		expect(deleteMessage).toHaveBeenCalledTimes(1);
		expect(unlock).toHaveBeenCalledTimes(1);
		expect(readCatch()).toMatchObject({ caseId: null, error: 'Missing Permissions' });
	});

	test('GIVEN an action that fails for another reason THEN it is logged and reported without the details', async () => {
		const error = vi.fn();
		Object.assign(container, { logger: { error } });
		vi.mocked(ModerationActions.softban.apply).mockRejectedValue(new Error('boom'));

		await catchHoneypotMessage(createMessage(), createSettings());

		expect(error).toHaveBeenCalledTimes(1);
		expect(unlock).toHaveBeenCalledTimes(1);
		expect(readCatch()).toMatchObject({ caseId: null, error: undefined });
	});

	test('GIVEN a member who was caught a moment ago THEN their next message is only deleted', async () => {
		const set = vi.fn(async () => null);
		Object.assign(container, { redis: { status: 'ready', set } });

		await catchHoneypotMessage(createMessage(), createSettings());

		expect(set).toHaveBeenCalledWith(`wolfstar:honeypot:caught:${guildId}:${userId}`, '1', 'EX', 60, 'NX');
		expect(deleteMessage).toHaveBeenCalledTimes(1);
		expect(ModerationActions.softban.apply).not.toHaveBeenCalled();
		expect(emit).not.toHaveBeenCalled();
	});

	test('GIVEN no Redis THEN the messages a member sends in a row still make one case', async () => {
		await Promise.all([
			catchHoneypotMessage(createMessage({ id: '1' }), createSettings()),
			catchHoneypotMessage(createMessage({ id: '2' }), createSettings()),
			catchHoneypotMessage(createMessage({ id: '3' }), createSettings())
		]);

		expect(deleteMessage).toHaveBeenCalledTimes(3);
		expect(ModerationActions.softban.apply).toHaveBeenCalledTimes(1);
		expect(emit).toHaveBeenCalledTimes(1);
	});

	test('GIVEN no Redis THEN another member, and the same one a minute later, are caught', async () => {
		const other = { ...author, id: '242043489611808769' };

		await catchHoneypotMessage(createMessage(), createSettings());
		await catchHoneypotMessage(createMessage({ author: other, member: { id: other.id, guildId } }), createSettings());
		expect(ModerationActions.softban.apply).toHaveBeenCalledTimes(2);

		vi.setSystemTime((now += 59_000));
		await catchHoneypotMessage(createMessage(), createSettings());
		expect(ModerationActions.softban.apply).toHaveBeenCalledTimes(2);

		vi.setSystemTime((now += 2000));
		await catchHoneypotMessage(createMessage(), createSettings());
		expect(ModerationActions.softban.apply).toHaveBeenCalledTimes(3);
	});

	test('GIVEN a Redis that fails THEN the process keeps the claim, and a burst is one case', async () => {
		const set = vi.fn(async () => {
			throw new Error('Connection is closed.');
		});
		Object.assign(container, { redis: { status: 'ready', set }, logger: { error: vi.fn() } });

		await catchHoneypotMessage(createMessage(), createSettings());
		await catchHoneypotMessage(createMessage(), createSettings());

		expect(set).toHaveBeenCalledTimes(2);
		expect(ModerationActions.softban.apply).toHaveBeenCalledTimes(1);
	});
});
