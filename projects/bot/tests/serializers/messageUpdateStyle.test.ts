import { getConfigurableKeys, SerializerStore, type Serializer } from '#lib/database';
import { UserSerializer } from '#root/serializers/messageUpdateStyle';
import { container } from '@wolfstar/http-framework';
import { getDefaultGuildSettings } from 'wolfstar-database';

// Echoes the key and its options, the translations are not what is tested here:
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key);

describe('messageUpdateStyle serializer', () => {
	let serializer: UserSerializer;
	let context: Serializer.UpdateContext;

	beforeAll(async () => {
		container.stores.register(new SerializerStore());
		await container.stores.loadPiece({ store: 'serializers', name: 'messageUpdateStyle', piece: UserSerializer });
		// The pieces registered by hand are constructed when the store loads:
		await container.stores.get('serializers').loadAll();

		serializer = container.stores.get('serializers').get('messageUpdateStyle') as UserSerializer;
		context = {
			entry: getConfigurableKeys().get('logsMessageUpdateStyle')!,
			entity: { ...getDefaultGuildSettings(), id: '254360814063058944' },
			guild: { id: '254360814063058944' },
			t
		} as unknown as Serializer.UpdateContext;
	});

	test('GIVEN the key THEN it shows the difference unless the server chooses otherwise', () => {
		const key = getConfigurableKeys().get('logsMessageUpdateStyle')!;

		expect(key.name).toBe('logs.message-update-style');
		expect(key.default).toBe('Difference');
		expect(getDefaultGuildSettings()!.logsMessageUpdateStyle).toBe('Difference');
	});

	test('GIVEN a style written in any case THEN it is the stored one', () => {
		expect(serializer.parse(' separate ', context).unwrap()).toBe('Separate');
		expect(serializer.parse('DIFFERENCE', context).unwrap()).toBe('Difference');
	});

	test('GIVEN something else THEN it is refused with the styles it could be', () => {
		const result = serializer.parse('merged', context);

		expect(result.isErr()).toBe(true);
		expect(result.unwrapErr().message).toContain('serializers:invalidMessageUpdateStyle');
		expect(result.unwrapErr().message).toContain('"possibles":["Difference","Separate"]');
	});

	test('GIVEN a stored value THEN only a style is valid', () => {
		expect(serializer.isValid('Separate')).toBe(true);
		expect(serializer.isValid('Difference')).toBe(true);
		expect(serializer.isValid('separate' as never)).toBe(false);
		expect(serializer.isValid(1 as never)).toBe(false);
	});

	test('GIVEN a style THEN it is displayed translated', () => {
		expect(serializer.stringify('Separate', context)).toBe('serializers:messageUpdateStyleSeparate');
	});
});
