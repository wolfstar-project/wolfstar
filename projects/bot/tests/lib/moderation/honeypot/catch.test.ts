import { fetchUserReportEnabled } from '#lib/database';
import { ModerationActions } from '#lib/moderation/actions/index';
import {
	catchHoneypotMessage,
	HoneypotDeleteMessageSeconds,
	HoneypotRecentDeleteSeconds,
	HoneypotTimeoutDuration
} from '#lib/moderation/honeypot/catch';
import { scheduleHoneypotSweep } from '#lib/moderation/honeypot/sweep';
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
	ModerationActions: { kick: { apply: vi.fn() }, softban: { apply: vi.fn() }, ban: { apply: vi.fn() }, timeout: { apply: vi.fn() } }
}));
vi.mock('#lib/moderation/common', () => ({ fetchGuildT: vi.fn(async () => (key: string) => key) }));
vi.mock('#lib/moderation/honeypot/log', () => ({ renderHoneypotLog: vi.fn(() => 'log') }));
vi.mock('#lib/moderation/honeypot/sweep', () => ({ scheduleHoneypotSweep: vi.fn(async () => undefined) }));
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
	const debug = vi.fn();

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

		Object.assign(container, {
			gatewayClient: {
				messages: { delete: deleteMessage },
				members: { fetch: vi.fn(async () => ({ communicationDisabledUntilTimestamp: null })) }
			},
			client: { emit },
			redis: undefined,
			logger: { debug, error: vi.fn(), fatal: vi.fn(), warn: vi.fn() }
		});
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

	test('GIVEN a moderator THEN the debug log says why nothing was done', async () => {
		vi.mocked(isModerator).mockResolvedValue(true);

		await catchHoneypotMessage(createMessage(), createSettings());

		expect(debug).toHaveBeenCalledTimes(1);
		expect(debug.mock.calls[0][0]).toContain('left alone, the author is a moderator');
	});

	test('GIVEN a member who is caught THEN the debug log follows every step', async () => {
		await catchHoneypotMessage(createMessage(), createSettings());
		await vi.waitFor(() => expect(debug.mock.calls.flat().join('\n')).toContain('the message was deleted'));

		const lines = debug.mock.calls.flat().join('\n');
		expect(lines).toContain(': caught');
		expect(lines).toContain('taking the action Softban');
		expect(lines).toContain('the action made the case 7');
		expect(lines).toContain(`reporting it to the channel ${logChannelId}`);
	});

	test('GIVEN a message that cannot be deleted THEN the debug log says so', async () => {
		const error = new DiscordAPIError({ code: 50013, message: 'Missing Permissions' }, 50013, 403, 'DELETE', 'https://discord.com', {});
		deleteMessage.mockRejectedValueOnce(error);

		await catchHoneypotMessage(createMessage(), createSettings());
		await vi.waitFor(() => expect(debug.mock.calls.flat().join('\n')).toContain('the message could not be deleted'));
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
		Object.assign(container, { logger: { debug, error } });
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

		expect(set).toHaveBeenCalledWith(`wolfstar:claims:honeypot-caught:${guildId}:${userId}`, expect.any(String), 'EX', 60, 'NX');
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
		const set = vi.fn(async (_key: string) => {
			throw new Error('Connection is closed.');
		});
		Object.assign(container, { redis: { status: 'ready', set } });

		await catchHoneypotMessage(createMessage(), createSettings());
		await catchHoneypotMessage(createMessage(), createSettings());

		// The claim the process kept answers the second message, Redis is not asked again for the catch (the claim of the
		// count in the warning is another key, which is the throttle of that edit):
		expect(set.mock.calls.filter(([key]) => String(key).includes('honeypot-caught'))).toHaveLength(1);
		expect(ModerationActions.softban.apply).toHaveBeenCalledTimes(1);
	});

	describe('options', () => {
		test('GIVEN the forward of the message THEN it is forwarded to the log channel before it is deleted', async () => {
			const post = vi.fn(async (_route: string) => ({}));
			Object.assign(container, { rest: { post } });

			await catchHoneypotMessage(createMessage(), createSettings({ honeypotForwardMessage: true }));

			expect(post).toHaveBeenCalledOnce();
			expect(post.mock.calls[0][0]).toContain(logChannelId);
			expect(post.mock.invocationCallOrder[0]).toBeLessThan(deleteMessage.mock.invocationCallOrder[0]);
		});

		test('GIVEN the timeout first THEN the member is timed out before the softban, and not before a kick', async () => {
			vi.mocked(ModerationActions.timeout.apply).mockResolvedValue({ id: 8 } as never);

			await catchHoneypotMessage(createMessage(), createSettings({ honeypotTimeoutFirst: true }));
			expect(ModerationActions.timeout.apply).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ duration: HoneypotTimeoutDuration }),
				{ sendDirectMessage: false }
			);
			expect(vi.mocked(ModerationActions.timeout.apply).mock.invocationCallOrder[0]).toBeLessThan(
				vi.mocked(ModerationActions.softban.apply).mock.invocationCallOrder[0]
			);

			vi.setSystemTime((now += 61_000));
			await catchHoneypotMessage(createMessage(), createSettings({ honeypotTimeoutFirst: true, honeypotAction: 'Kick' }));
			expect(ModerationActions.timeout.apply).toHaveBeenCalledOnce();
		});

		test('an existing longer timeout is preserved', async () => {
			vi.mocked(container.gatewayClient.members.fetch).mockResolvedValue({
				communicationDisabledUntilTimestamp: now + HoneypotTimeoutDuration * 2
			} as never);
			await catchHoneypotMessage(createMessage(), createSettings({ honeypotTimeoutFirst: true }));
			expect(ModerationActions.timeout.apply).not.toHaveBeenCalled();
			expect(ModerationActions.softban.apply).toHaveBeenCalled();
		});

		test('GIVEN a guild with no system nor rules channel THEN no invite is made on the trap, which would die with it', async () => {
			const post = vi.fn(async () => ({ code: 'return' }));
			Object.assign(container, { rest: { post } });

			await catchHoneypotMessage(
				createMessage({ guild: { id: guildId, systemChannelId: null, rulesChannelId: null } }),
				createSettings({ honeypotReinvite: true })
			);

			expect(post).not.toHaveBeenCalled();
			expect(ModerationActions.softban.apply).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.not.objectContaining({ reinviteUrl: expect.anything() })
			);
		});

		test('GIVEN a rules channel and no system channel THEN the invite is made there', async () => {
			const post = vi.fn(async () => ({ code: 'rules' }));
			Object.assign(container, { rest: { post } });

			await catchHoneypotMessage(
				createMessage({ guild: { id: guildId, systemChannelId: null, rulesChannelId: '254360814063058999' } }),
				createSettings({ honeypotReinvite: true })
			);

			expect(post).toHaveBeenCalledWith(expect.stringContaining('254360814063058999'), expect.anything());
		});

		test('a reinvite reaches the action DM after a softban but is never created for a ban', async () => {
			const post = vi.fn(async () => ({ code: 'return' }));
			Object.assign(container, { rest: { post } });
			await catchHoneypotMessage(
				createMessage({ guild: { id: guildId, systemChannelId: '254360814063058998' } }),
				createSettings({ honeypotReinvite: true })
			);
			expect(ModerationActions.softban.apply).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.objectContaining({ reinviteUrl: 'https://discord.gg/return' })
			);
			post.mockClear();
			vi.setSystemTime((now += 61_000));
			await catchHoneypotMessage(
				createMessage({ guild: { id: guildId, systemChannelId: '254360814063058998' } }),
				createSettings({ honeypotReinvite: true, honeypotAction: 'Ban' })
			);
			expect(post).not.toHaveBeenCalled();
		});

		test('GIVEN the recent delete THEN the softban deletes the last fifteen minutes', async () => {
			await catchHoneypotMessage(createMessage(), createSettings({ honeypotRecentDelete: true }));

			expect(ModerationActions.softban.apply).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
				sendDirectMessage: true,
				context: HoneypotRecentDeleteSeconds
			});
			expect(HoneypotRecentDeleteSeconds).toBeLessThan(HoneypotDeleteMessageSeconds);
		});

		test('GIVEN the ensured deletion THEN a sweep is scheduled, even when the action failed', async () => {
			vi.mocked(ModerationActions.softban.apply).mockRejectedValue(
				new DiscordAPIError({ message: 'Missing Permissions', code: 50013 }, 50013, 403, 'PUT', 'url', {})
			);

			await catchHoneypotMessage(createMessage(), createSettings({ honeypotEnsureDeletion: true }));

			expect(scheduleHoneypotSweep).toHaveBeenCalledWith({ guildId, userId, caughtAt: now, deleteSeconds: HoneypotDeleteMessageSeconds });
		});

		test('GIVEN the options off THEN nothing is forwarded, timed out nor swept', async () => {
			const post = vi.fn(async (_route: string) => ({}));
			Object.assign(container, { rest: { post } });

			await catchHoneypotMessage(createMessage(), createSettings());

			expect(post).not.toHaveBeenCalled();
			expect(ModerationActions.timeout.apply).not.toHaveBeenCalled();
			expect(scheduleHoneypotSweep).not.toHaveBeenCalled();
		});
	});
});
