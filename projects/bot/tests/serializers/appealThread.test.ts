import { getConfigurableKeys, SerializerStore, type Serializer } from '#lib/database';
import { UserSerializer } from '#root/serializers/appealThread';
import { container } from '@wolfstar/http-framework';
import { getDefaultGuildSettings } from 'wolfstar-database';

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key);

describe('appealThread serializer', () => {
	let serializer: UserSerializer;
	let context: Serializer.UpdateContext;

	beforeAll(async () => {
		container.stores.register(new SerializerStore());
		await container.stores.loadPiece({ store: 'serializers', name: 'appealThread', piece: UserSerializer });
		await container.stores.get('serializers').loadAll();

		serializer = container.stores.get('serializers').get('appealThread') as UserSerializer;
		context = {
			entry: getConfigurableKeys().get('appealsThread')!,
			entity: { ...getDefaultGuildSettings(), id: '254360814063058944' },
			guild: { id: '254360814063058944' },
			t
		} as unknown as Serializer.UpdateContext;
	});

	test.each(['none', 'public', 'private', ' PRIVATE '])('GIVEN %j THEN it is a mode of the thread', async (input) => {
		expect((await serializer.parse(input, context)).isOk()).toBe(true);
	});

	test('GIVEN anything else THEN it is refused', async () => {
		expect((await serializer.parse('forum', context)).isErr()).toBe(true);
		expect(await serializer.isValid('forum' as never)).toBe(false);
	});

	test('GIVEN a new server THEN each appeal gets a public thread and the limits of the design', () => {
		const defaults = getDefaultGuildSettings()!;

		expect(defaults.appealsThread).toBe('public');
		expect(defaults.appealsCooldownDays).toBe(7);
		expect(defaults.appealsMaxActive).toBe(1);
	});

	test('GIVEN the numbers of the appeals THEN they are held to their limits', () => {
		const keys = getConfigurableKeys();

		expect([keys.get('appealsCooldownDays')!.minimum, keys.get('appealsCooldownDays')!.maximum]).toEqual([0, 365]);
		expect([keys.get('appealsMaxActive')!.minimum, keys.get('appealsMaxActive')!.maximum]).toEqual([1, 10]);
	});
});
