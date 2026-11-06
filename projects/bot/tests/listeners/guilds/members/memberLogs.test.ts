import { readSettings } from '#lib/database';
import { fetchMemberRoleIds } from '#lib/moderation/common';
import { createGuildMember, guild } from '#mocks/MockInstances';
import { UserListener as MemberAddListener } from '#root/listeners/guilds/members/notMutedMemberAddNotify';
import { UserListener as MemberRemoveListener } from '#root/listeners/guilds/members/rawMemberRemoveNotify';
import { getLogger, getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import type { EmbedBuilder } from '@discordjs/builders';
import { roleMention } from '@discordjs/builders';
import texts_ from '../../../../src/locales/en-US/events/guilds-members.json' with { type: 'json' };
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/database')>()),
	readSettings: vi.fn()
}));
// The English text of the logs, what a guild without a language of its own reads:
const texts = vi.hoisted(() => ({ value: {} as Record<string, string> }));
beforeAll(() => {
	texts.value = texts_;
});
vi.mock('#lib/moderation/common', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/moderation/common')>()),
	fetchGuildT: vi.fn(async () => (key: string, options: Record<string, unknown> = {}) => {
		const text = texts.value[key.replace('events/guilds-members:', '')] ?? key;
		return text.replaceAll(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name]));
	}),
	fetchMemberRoleIds: vi.fn(async () => [])
}));
vi.mock('#utils/functions', async (importOriginal) => ({
	...(await importOriginal<typeof import('#utils/functions')>()),
	getLogger: vi.fn(),
	getModeration: vi.fn()
}));

// The listeners are run directly, so they are given the least a piece is built with:
function create<Piece extends object>(Piece_: new (context: never, options: never) => Piece, name: string): Piece {
	return new Piece_({ name, path: `/listeners/${name}.ts`, root: '/', store: { name: 'listeners' } } as never, {} as never);
}

const logsChannelId = '254360814063058960';

describe('the logs of the members who join and leave', () => {
	const send = vi.fn();

	// What the logger was asked to send, the embed the listener makes for the channel:
	async function sentEmbed() {
		expect(send).toHaveBeenCalledTimes(1);
		const options = send.mock.calls[0][0] as { key: string; channelId: string; makeMessage: () => EmbedBuilder | Promise<EmbedBuilder> };
		return { key: options.key, channelId: options.channelId, embed: (await options.makeMessage()).toJSON() };
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(readSettings).mockResolvedValue({
			...getDefaultGuildSettings()!,
			id: guild.id,
			logsMemberAdd: logsChannelId,
			logsMemberRemove: logsChannelId
		} as ReadonlyGuildData);
		vi.mocked(getLogger).mockResolvedValue({ send } as never);
		vi.mocked(fetchMemberRoleIds).mockResolvedValue([]);
	});

	describe('a member who joins', () => {
		const listener = create(MemberAddListener, 'notMutedMemberAddNotify');

		test('GIVEN a member WHEN they join THEN a green User Joined embed mentions them and when their account was made', async () => {
			const member = createGuildMember({ user: { id: '266624760782258201', username: 'newcomer' } });

			await listener.run(member);

			const { key, channelId, embed } = await sentEmbed();
			expect(key).toBe('logsMemberAdd');
			expect(channelId).toBe(logsChannelId);
			expect(embed.footer?.text).toBe('User Joined');
			expect(embed.description).toContain('<@266624760782258201>');
			expect(embed.description).toMatch(/joined Discord <t:\d+:R>/);
			expect(embed.fields).toBeUndefined();
			expect(embed.thumbnail).toBeUndefined();
		});
	});

	describe('a member who leaves', () => {
		const listener = create(MemberRemoveListener, 'rawMemberRemoveNotify');
		const user = { id: '266624760782258202', username: 'leaver', discriminator: '0', avatar: null, flags: 0 };

		function mockLatestCase(type: TypeVariation | null) {
			vi.mocked(getModeration).mockResolvedValue({
				waitLock: vi.fn(async () => undefined),
				getLatestRecentCachedEntryForUser: vi.fn(() => (type === null ? null : { type }))
			} as never);
		}

		test.each([
			[null, 'User Left'],
			[TypeVariation.Kick, 'User Kicked'],
			[TypeVariation.Ban, 'User Banned'],
			[TypeVariation.Softban, 'User Softbanned']
		] as const)('GIVEN the latest case %s WHEN a member leaves THEN the footer says %s', async (type, footer) => {
			mockLatestCase(type);

			await listener.run(guild, createGuildMember({ user }), { guild_id: guild.id, user });

			const { key, channelId, embed } = await sentEmbed();
			expect(key).toBe('logsMemberRemove');
			expect(channelId).toBe(logsChannelId);
			expect(embed.footer?.text).toBe(footer);
			expect(embed.description).toMatch(/joined this server <t:\d+:R>/);
		});

		test('GIVEN a member the cache did not hold WHEN they leave THEN the description says they joined an unknown time ago', async () => {
			mockLatestCase(null);

			await listener.run(guild, null, { guild_id: guild.id, user });

			const { embed } = await sentEmbed();
			expect(embed.description).toContain('joined this server *an unknown time ago*');
			expect(embed.description).not.toContain('<t:');
		});

		test('GIVEN a member with roles WHEN they leave THEN the roles are a line of the description', async () => {
			mockLatestCase(null);
			vi.mocked(fetchMemberRoleIds).mockResolvedValue(['254360814063058970', '254360814063058971']);

			await listener.run(guild, createGuildMember({ user }), { guild_id: guild.id, user });

			const { embed } = await sentEmbed();
			const lines = embed.description!.split('\n');
			expect(lines).toHaveLength(2);
			expect(lines[1]).toBe(`**Roles**: ${roleMention('254360814063058970')} ${roleMention('254360814063058971')}`);
		});

		test('GIVEN a member with no roles WHEN they leave THEN the description has no roles line', async () => {
			mockLatestCase(null);

			await listener.run(guild, createGuildMember({ user }), { guild_id: guild.id, user });

			const { embed } = await sentEmbed();
			expect(embed.description).not.toContain('Roles');
			expect(embed.description!.split('\n')).toHaveLength(1);
		});

		test('GIVEN no channel for the logs WHEN a member leaves THEN nothing is sent', async () => {
			vi.mocked(readSettings).mockResolvedValue({ ...getDefaultGuildSettings()!, id: guild.id, logsMemberRemove: null } as ReadonlyGuildData);

			await listener.run(guild, null, { guild_id: guild.id, user });

			expect(send).not.toHaveBeenCalled();
		});
	});
});
