import { getConfigurableKeys, SerializerStore, type Serializer } from '#lib/database';
import { getJoinGuardRoleProblem } from '#lib/moderation/joinguard/permissions';
import { UserSerializer as TimeoutSerializer } from '#root/serializers/joinGuardTimeout';
import { UserSerializer as RoleSerializer } from '#root/serializers/manageableRole';
import { UserSerializer as NumberSerializer } from '#root/serializers/number';
import { UserSerializer as StringSerializer } from '#root/serializers/string';
import { container } from '@wolfstar/http-framework';
import { getDefaultGuildSettings } from 'wolfstar-database';

vi.mock('#lib/moderation/joinguard/permissions', () => ({ getJoinGuardRoleProblem: vi.fn() }));

const t = (key: string) => key;
const guildId = '254360814063058944';

describe('join guard settings', () => {
	const store = () => container.stores.get('serializers');
	const context = (property: Parameters<ReturnType<typeof getConfigurableKeys>['get']>[0]) =>
		({
			entry: getConfigurableKeys().get(property)!,
			entity: { ...getDefaultGuildSettings(), id: guildId },
			guild: { id: guildId },
			t
		}) as unknown as Serializer.UpdateContext;

	beforeAll(async () => {
		container.stores.register(new SerializerStore());
		const pieces = { joinGuardTimeout: TimeoutSerializer, manageableRole: RoleSerializer, number: NumberSerializer, string: StringSerializer };
		for (const [name, piece] of Object.entries(pieces)) await container.stores.loadPiece({ store: 'serializers', name, piece: piece as never });
		await store().loadAll();
	});

	describe('the timeout of the checkpoint', () => {
		const serializer = () => store().get('joinGuardTimeout') as TimeoutSerializer;

		test.each([
			['24h', 86_400],
			['1h', 3600],
			['7d', 604_800],
			['0', 0],
			['never', 0]
		])('GIVEN %s THEN it is %i seconds', (input, seconds) => {
			expect(serializer().parse(input, context('joinGuardCheckpointTimeout')).unwrap()).toBe(seconds);
		});

		test.each(['30m', '8d', 'soon', '-1h'])('GIVEN %s THEN it is refused', (input) => {
			expect(serializer().parse(input, context('joinGuardCheckpointTimeout')).isErr()).toBe(true);
		});

		test('GIVEN what the dashboard writes THEN 0 and one hour to a week are valid, nothing between', () => {
			const ctx = context('joinGuardCheckpointTimeout');
			expect(serializer().isValid(0, ctx)).toBe(true);
			expect(serializer().isValid(3600, ctx)).toBe(true);
			expect(serializer().isValid(604_800, ctx)).toBe(true);
			expect(() => serializer().isValid(60, ctx)).toThrow('serializers:invalidJoinGuardTimeout');
			expect(() => serializer().isValid(604_801, ctx)).toThrow('serializers:invalidJoinGuardTimeout');
			expect(() => serializer().isValid(3600.5, ctx)).toThrow('serializers:invalidJoinGuardTimeout');
		});
	});

	test('GIVEN the minimum trust THEN it goes from 1 to 3', () => {
		const ctx = context('joinGuardMinimumTrust');
		const number = store().get('number') as NumberSerializer;

		expect(number.isValid(1, ctx)).toBe(true);
		expect(number.isValid(3, ctx)).toBe(true);
		expect(() => number.isValid(0, ctx)).toThrow('serializers:invalidInt');
		expect(() => number.isValid(4, ctx)).toThrow('serializers:invalidInt');
	});

	test('GIVEN the direct message THEN it has 1 to 500 characters', () => {
		const ctx = context('joinGuardDirectMessageContent');
		const text = store().get('string') as StringSerializer;

		expect(text.isValid('Welcome to {server}', ctx)).toBe(true);
		expect(text.isValid('a'.repeat(500), ctx)).toBe(true);
		expect(text.isValid('a'.repeat(501), ctx)).toBe(false);
		expect(text.isValid('', ctx)).toBe(false);
	});

	test('GIVEN a pending or a verified role THEN it must be one the bot can manage', async () => {
		const ctx = context('joinGuardPendingRole');
		const role = store().get('manageableRole') as RoleSerializer;

		vi.mocked(getJoinGuardRoleProblem).mockResolvedValueOnce(null);
		await expect(role.isValid('300', ctx)).resolves.toBe(true);

		vi.mocked(getJoinGuardRoleProblem).mockResolvedValueOnce('above');
		await expect(role.isValid('300', ctx)).rejects.toBe('serializers:roleNotManageable');

		vi.mocked(getJoinGuardRoleProblem).mockResolvedValueOnce('unknown');
		await expect(role.isValid('300', ctx)).rejects.toBe('serializers:invalidRole');
	});
});
