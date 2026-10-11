import { getConfigurableKeys, SerializerStore, type Serializer } from '#lib/database';
import { UserSerializer } from '#root/serializers/honeypotAction';
import { container } from '@wolfstar/http-framework';
import { getDefaultGuildSettings } from 'wolfstar-database';

// Echoes the key and its options, the translations are not what is tested here:
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key);

describe('honeypotAction serializer', () => {
	let serializer: UserSerializer;
	let context: Serializer.UpdateContext;

	beforeAll(async () => {
		container.stores.register(new SerializerStore());
		await container.stores.loadPiece({ store: 'serializers', name: 'honeypotAction', piece: UserSerializer });
		// The pieces registered by hand are constructed when the store loads:
		await container.stores.get('serializers').loadAll();

		serializer = container.stores.get('serializers').get('honeypotAction') as UserSerializer;
		context = {
			entry: getConfigurableKeys().get('honeypotAction')!,
			entity: { ...getDefaultGuildSettings(), id: '254360814063058944' },
			guild: { id: '254360814063058944' },
			t
		} as unknown as Serializer.UpdateContext;
	});

	test('GIVEN the settings of a new server THEN the honeypot is off and would softban', () => {
		const defaults = getDefaultGuildSettings()!;

		expect(defaults.honeypotChannel).toBeNull();
		expect(defaults.honeypotAction).toBe('Softban');
		expect(getConfigurableKeys().get('honeypotAction')!.name).toBe('honeypot.action');
		expect(getConfigurableKeys().get('honeypotAction')!.default).toBe('Softban');
	});

	test('GIVEN the keys of the honeypot THEN each defaults to what the database does', () => {
		const defaults = getDefaultGuildSettings() as Record<string, unknown>;
		const keys = [...getConfigurableKeys().values()].filter((key) => key.name.startsWith('honeypot.'));

		expect(keys.map((key) => key.name)).toEqual([
			'honeypot.channel',
			'honeypot.log-channel',
			'honeypot.action',
			'honeypot.direct-message',
			'honeypot.warning',
			'honeypot.random-name',
			'honeypot.keep-active'
		]);
		expect(keys.map((key) => key.default)).toEqual(keys.map((key) => defaults[key.property]));
	});

	test('GIVEN an action written in any case THEN it is the stored one', () => {
		expect(serializer.parse(' ban ', context).unwrap()).toBe('Ban');
		expect(serializer.parse('SOFTBAN', context).unwrap()).toBe('Softban');
		expect(serializer.parse('Kick', context).unwrap()).toBe('Kick');
	});

	test('GIVEN something else THEN it is refused with the actions it could be', () => {
		const result = serializer.parse('timeout', context);

		expect(result.isErr()).toBe(true);
		expect(result.unwrapErr().message).toContain('serializers:invalidHoneypotAction');
		expect(result.unwrapErr().message).toContain('"possibles":["Kick","Softban","Ban"]');
	});

	test('GIVEN a stored value THEN only an action is valid', () => {
		expect(serializer.isValid('Ban')).toBe(true);
		expect(serializer.isValid('ban' as never)).toBe(false);
		expect(serializer.isValid(1 as never)).toBe(false);
	});

	test('GIVEN an action THEN it is displayed translated', () => {
		expect(serializer.stringify('Softban', context)).toBe('serializers:honeypotActionSoftban');
	});
});
