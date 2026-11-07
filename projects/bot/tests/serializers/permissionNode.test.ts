import { getConfigurableKeys, SerializerStore, type Serializer } from '#lib/database';
import { UserSerializer } from '#root/serializers/permissionNode';
import { container } from '@wolfstar/http-framework';
import { createAccessEntry, getDefaultGuildSettings, type PermissionsNode } from 'wolfstar-database';

const guildId = '254360814063058944';
const ownerId = '242043489611808769';
const roleId = '541739191776575502';
const userId = '266624760782258186';
const t = (key: string) => key;

describe('permission node serializer', () => {
	const original = container.gatewayClient;
	let serializer: UserSerializer;

	function context(property: 'permissionsRoles' | 'permissionsUsers') {
		return {
			entry: getConfigurableKeys().get(property)!,
			entity: { ...getDefaultGuildSettings(), id: guildId },
			guild: { id: guildId, ownerId },
			t
		} as unknown as Serializer.UpdateContext;
	}

	// `isValid` throws the identifier of what is wrong, and answers `true` otherwise:
	async function validate(value: unknown, property: 'permissionsRoles' | 'permissionsUsers' = 'permissionsRoles') {
		try {
			return await serializer.isValid(value as PermissionsNode, context(property));
		} catch (error) {
			return error;
		}
	}

	beforeAll(async () => {
		container.stores.register(new SerializerStore());
		await container.stores.loadPiece({ store: 'serializers', name: 'permissionNode', piece: UserSerializer });
		await container.stores.get('serializers').loadAll();
		serializer = container.stores.get('serializers').get('permissionNode') as UserSerializer;

		const roles = [{ id: roleId }, { id: guildId }];
		(container as any).gatewayClient = {
			roles: { cache: { get: () => undefined }, resolveKey: (guild: string, id: string) => `${guild}:${id}`, fetchAll: async () => roles },
			members: {
				fetch: async (_guild: string, id: string) => ([userId, ownerId].includes(id) ? { id } : Promise.reject(new Error('Unknown Member')))
			}
		};
	});

	afterAll(() => {
		(container as any).gatewayClient = original;
	});

	test('GIVEN a dashboard access rule of a role or a member THEN it is valid', async () => {
		await expect(validate(createAccessEntry(roleId, 'allow'))).resolves.toBe(true);
		await expect(validate(createAccessEntry(userId, 'deny'), 'permissionsUsers')).resolves.toBe(true);
	});

	test('GIVEN a rule that is not of the shape of one THEN it is refused', async () => {
		await expect(validate({ id: roleId, allow: ['settings'], deny: [], dashboard: 'allow' })).resolves.toBe('serializers:permissionNodeInvalid');
		await expect(validate({ id: roleId, allow: [], deny: [], dashboard: 'maybe' })).resolves.toBe('serializers:permissionNodeInvalid');
		await expect(validate({ id: roleId, allow: [], deny: [], dashboard: 'allow', extra: true })).resolves.toBe(
			'serializers:permissionNodeInvalid'
		);
	});

	test('GIVEN a rule on @everyone THEN it can keep everybody out but never let everybody in', async () => {
		await expect(validate(createAccessEntry(guildId, 'deny'))).resolves.toBe(true);
		await expect(validate(createAccessEntry(guildId, 'allow'))).resolves.toBe('serializers:permissionNodeSecurityEveryoneAllows');
	});

	test('GIVEN a rule on the owner THEN it is refused, as a node is', async () => {
		await expect(validate(createAccessEntry(ownerId, 'deny'), 'permissionsUsers')).resolves.toBe('serializers:permissionNodeSecurityOwner');
	});

	test('GIVEN a rule and a node THEN each reads as what it is', () => {
		expect(serializer.stringify(createAccessEntry(roleId, 'deny'))).toBe(`${roleId}(dashboard: deny)`);
		expect(serializer.stringify({ id: roleId, allow: ['ping'], deny: [] })).toBe(`${roleId}(ping | )`);
	});
});
