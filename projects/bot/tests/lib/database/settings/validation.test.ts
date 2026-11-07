import { SerializerStore } from '#lib/database';
import { validateSettingsChanges } from '#lib/database/settings/validation';
import { createTranslator } from '#lib/structures/commands/utils';
import { UserSerializer as RoleSerializer } from '#root/serializers/manageableRole';
import { container } from '@wolfstar/http-framework';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/moderation/joinguard/permissions', () => ({ getJoinGuardRoleProblem: vi.fn(async () => null) }));

const guildId = '254360814063058944';
const t = createTranslator(((key: string) => key) as never);
const settings = { ...getDefaultGuildSettings()!, id: guildId, joinGuardPendingRole: '100', joinGuardVerifiedRole: '200' } as ReadonlyGuildData;

describe('validateSettingsChanges', () => {
	beforeAll(async () => {
		container.stores.register(new SerializerStore());
		await container.stores.loadPiece({ store: 'serializers', name: 'manageableRole', piece: RoleSerializer as never });
		await container.stores.get('serializers').loadAll();
		Object.assign(container, { gatewayClient: { guilds: { resolve: async () => ({ id: guildId }) } } });
	});

	test('GIVEN the roles of the checkpoint swapped in one write THEN it is accepted, they end up different', async () => {
		await expect(
			validateSettingsChanges(
				settings,
				[
					['joinGuardPendingRole', '200'],
					['joinGuardVerifiedRole', '100']
				],
				t
			)
		).resolves.toEqual([
			['joinGuardPendingRole', '200'],
			['joinGuardVerifiedRole', '100']
		]);
	});

	test('GIVEN the pending role moved to the verified one, which moves too THEN it is accepted', async () => {
		await expect(
			validateSettingsChanges(
				settings,
				[
					['joinGuardPendingRole', '200'],
					['joinGuardVerifiedRole', '300']
				],
				t
			)
		).resolves.toHaveLength(2);
	});

	test('GIVEN both roles set to one role THEN it is refused', async () => {
		await expect(
			validateSettingsChanges(
				settings,
				[
					['joinGuardPendingRole', '300'],
					['joinGuardVerifiedRole', '300']
				],
				t
			)
		).rejects.toContainEqual(expect.stringContaining('serializers:joinGuardSameRoles'));
	});

	test('GIVEN one role set to the other one that stays THEN it is refused', async () => {
		await expect(validateSettingsChanges(settings, [['joinGuardPendingRole', '200']], t)).rejects.toContainEqual(
			expect.stringContaining('serializers:joinGuardSameRoles')
		);
	});

	test('GIVEN a key that does not exist THEN it is refused by its name', async () => {
		await expect(validateSettingsChanges(settings, [['nope' as never, 1]], t)).rejects.toEqual([
			'nope: The key nope does not exist in the current schema.'
		]);
	});
});
