import { getConfigurableKeys, SerializerStore, type Serializer } from '#lib/database';
import type { SchemaKeyType } from '#lib/database/settings/schema/SchemaKey';
import { getSettingChannelTypes, getSettingExperimentalNote, getSettingKind } from '#lib/structures/settings-menu';
import { UserSerializer } from '#root/serializers/channel';
import { container } from '@wolfstar/http-framework';
import { ChannelType } from 'discord-api-types/v10';
import { getDefaultGuildSettings } from 'wolfstar-database';

const guildId = '254360814063058944';
// The mention of a channel holds a snowflake:
const id = (n: number) => `1000000000000000${String(n).padStart(2, '0')}`;
const t = (key: string) => key;

describe('channel serializer', () => {
	const channels = new Map<string, { id: string; guildId: string; type: ChannelType; name: string }>();
	const original = container.gatewayClient;
	let serializer: UserSerializer;

	function createContext(property: 'logsMemberAdd' | 'honeypotChannel' | 'reportsChannel') {
		return {
			entry: getConfigurableKeys().get(property)!,
			entity: { ...getDefaultGuildSettings(), id: guildId },
			guild: { id: guildId },
			t
		} as unknown as Serializer.UpdateContext;
	}

	beforeAll(async () => {
		container.stores.register(new SerializerStore());
		await container.stores.loadPiece({ store: 'serializers', name: 'channel', piece: UserSerializer });
		await container.stores.get('serializers').loadAll();
		serializer = container.stores.get('serializers').get('guildLogChannel') as UserSerializer;

		const add = (n: number, type: ChannelType) => channels.set(id(n), { id: id(n), guildId, type, name: `channel-${n}` });
		add(1, ChannelType.GuildText);
		add(2, ChannelType.GuildAnnouncement);
		add(3, ChannelType.PublicThread);
		add(4, ChannelType.PrivateThread);
		add(5, ChannelType.AnnouncementThread);
		add(6, ChannelType.GuildForum);
		add(7, ChannelType.GuildVoice);
		add(9, ChannelType.GuildCategory);
		add(10, ChannelType.GuildStageVoice);
		add(11, ChannelType.GuildMedia);
		add(12, ChannelType.GuildDirectory);
		channels.set(id(8), { id: id(8), guildId: '999', type: ChannelType.PublicThread, name: 'elsewhere' });
		(container as any).gatewayClient = {
			channels: { fetch: vi.fn(async (id: string) => channels.get(id) ?? Promise.reject(new Error('Unknown Channel'))) }
		};
	});

	afterAll(() => {
		(container as any).gatewayClient = original;
	});

	test('GIVEN the keys of the logs THEN they are of the type that takes threads, and are marked experimental', () => {
		const key = getConfigurableKeys().get('logsMemberAdd')!;

		expect(key.type).toBe('guildLogChannel');
		expect(getSettingKind(key)).toBe('channel');
		expect(getSettingExperimentalNote(key)).toBe('commands/conf:menuExperimentalThreads');
		expect(getSettingChannelTypes(key)).toEqual([
			ChannelType.GuildText,
			ChannelType.GuildAnnouncement,
			ChannelType.PublicThread,
			ChannelType.PrivateThread,
			ChannelType.AnnouncementThread
		]);
	});

	test('GIVEN a channel that is not of a log THEN it takes no thread and is not experimental', () => {
		const key = getConfigurableKeys().get('reportsChannel')!;

		expect(getSettingExperimentalNote(key)).toBeNull();
		expect(getSettingChannelTypes(key)).toEqual([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
	});

	test.each([1, 2, 3, 4, 5])('GIVEN the text channel, the announcement channel or the thread %i THEN a log accepts it', async (n) => {
		await expect(serializer.isValid(id(n), createContext('logsMemberAdd'))).resolves.toBe(true);
		expect((await serializer.parse(`<#${id(n)}>`, createContext('logsMemberAdd'))).isOk()).toBe(true);
	});

	test.each([6, 7, 8, 99])('GIVEN the channel %i (a forum, a voice channel, another guild, none) THEN a log refuses it', async (n) => {
		await expect(serializer.isValid(id(n), createContext('logsMemberAdd'))).resolves.toBe(false);
		expect((await serializer.parse(id(n), createContext('logsMemberAdd'))).isErr()).toBe(true);
	});

	test('GIVEN a thread THEN the other text channel keys refuse it', async () => {
		await expect(serializer.isValid(id(3), createContext('honeypotChannel'))).resolves.toBe(false);
		await expect(serializer.isValid(id(3), createContext('reportsChannel'))).resolves.toBe(false);
		await expect(serializer.isValid(id(1), createContext('reportsChannel'))).resolves.toBe(true);
	});

	test.each([
		['guildTextChannel', [1, 2]],
		['guildLogChannel', [1, 2, 3, 4, 5]],
		['guildVoiceChannel', [7]],
		['guildCategoryChannel', [9]],
		['categoryOrTextChannel', [1, 9]]
	] satisfies [SchemaKeyType, number[]][])(
		'GIVEN a %s setting THEN typing and selecting a channel accept the same supported types',
		async (type, accepted) => {
			const context = createContext('reportsChannel');
			context.entry = { ...context.entry, type } as typeof context.entry;
			const piece = container.stores.get('serializers').get(type)!;
			for (const n of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]) {
				expect(await piece.isValid(id(n), context)).toBe(accepted.includes(n));
				expect((await piece.parse(`<#${id(n)}>`, context)).isOk()).toBe(accepted.includes(n));
				expect(getSettingChannelTypes(context.entry).includes(channels.get(id(n))!.type)).toBe(accepted.includes(n));
			}
		}
	);
});
