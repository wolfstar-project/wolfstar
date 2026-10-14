import {
	getAddedRoles,
	getRemovedRoles,
	getUsersInCourse,
	markOwnRoleChange,
	takeOwnRoleChange,
	type CaseInCourse
} from '#lib/moderation/common/roleChanges';
import { TypeVariation } from '#utils/moderationConstants';
import { container } from '@wolfstar/http-framework';

describe('roleChanges', () => {
	const guildId = '254360814063058944';
	const userId = '266624760782258186';
	const roleId = '541738403230777351';

	describe('getRemovedRoles', () => {
		test('GIVEN a member who lost a role THEN it is the one returned', () => {
			expect(getRemovedRoles(['1', '2', '3'], ['1', '3'])).toEqual(['2']);
		});

		test('GIVEN a member who only gained roles THEN nothing is returned', () => {
			expect(getRemovedRoles(['1'], ['1', '2'])).toEqual([]);
		});

		test('GIVEN a member whose roles were replaced THEN all the ones that went are returned', () => {
			expect(getRemovedRoles(['1', '2'], ['3'])).toEqual(['1', '2']);
		});
	});

	describe('getAddedRoles', () => {
		test('GIVEN a member who gained a role THEN it is the one returned', () => {
			expect(getAddedRoles(['1', '3'], ['1', '2', '3'])).toEqual(['2']);
		});

		test('GIVEN a member who only lost roles THEN nothing is returned', () => {
			expect(getAddedRoles(['1', '2'], ['1'])).toEqual([]);
		});

		test('GIVEN a member whose roles were replaced THEN all the ones that came are returned', () => {
			expect(getAddedRoles(['1', '2'], ['3', '4'])).toEqual(['3', '4']);
		});
	});

	describe('getUsersInCourse', () => {
		function entry(
			id: number,
			user: string,
			state: 'active' | 'undo' | 'completed' | 'archived' = 'active',
			type = TypeVariation.Mute
		): CaseInCourse {
			return {
				id,
				type,
				userId: user,
				isArchived: () => state === 'archived',
				isCompleted: () => state === 'completed',
				isUndo: () => state === 'undo'
			};
		}

		test('GIVEN a mute that is in course THEN its user is returned', () => {
			expect(getUsersInCourse([entry(1, 'a')], TypeVariation.Mute)).toEqual(['a']);
		});

		test('GIVEN a mute that was undone THEN its user is not returned', () => {
			expect(getUsersInCourse([entry(1, 'a', 'completed'), entry(2, 'a', 'undo')], TypeVariation.Mute)).toEqual([]);
		});

		test('GIVEN a user who was muted again after an unmute THEN they are returned', () => {
			expect(getUsersInCourse([entry(3, 'a'), entry(1, 'a', 'completed'), entry(2, 'a', 'undo')], TypeVariation.Mute)).toEqual(['a']);
		});

		test('GIVEN cases of another type and archived ones THEN they are not looked at', () => {
			const entries = [entry(1, 'a', 'active', TypeVariation.Warning), entry(2, 'b', 'archived'), entry(3, 'c')];

			expect(getUsersInCourse(entries, TypeVariation.Mute)).toEqual(['c']);
		});
	});

	describe('own role changes', () => {
		const stored = new Map<string, { value: string; seconds: number }>();
		const redis = {
			status: 'ready',
			set: async (key: string, value: string, _mode: string, seconds: number) => void stored.set(key, { value, seconds }),
			getdel: async (key: string) => {
				const entry = stored.get(key);
				stored.delete(key);
				return entry?.value ?? null;
			}
		};
		let previous: unknown;

		beforeAll(() => {
			previous = (container as any).redis;
			(container as any).redis = redis;
		});

		afterAll(() => {
			(container as any).redis = previous;
		});

		beforeEach(() => {
			stored.clear();
			redis.status = 'ready';
		});

		test('GIVEN a role the bot is about to take THEN it is remembered for half a minute, and answered once', async () => {
			await markOwnRoleChange(guildId, userId, roleId);

			expect([...stored.keys()]).toEqual([`wolfstar:moderation:role-change:${guildId}:${userId}:${roleId}`]);
			expect([...stored.values()].map((entry) => entry.seconds)).toEqual([30]);
			await expect(takeOwnRoleChange(guildId, userId, roleId)).resolves.toBe(true);
			await expect(takeOwnRoleChange(guildId, userId, roleId)).resolves.toBe(false);
		});

		test('GIVEN a role that was taken by hand THEN it is not one of the bot', async () => {
			await markOwnRoleChange(guildId, userId, '1');

			await expect(takeOwnRoleChange(guildId, userId, roleId)).resolves.toBe(false);
		});

		test('GIVEN a role the bot is about to give THEN it is not taken for one the bot took', async () => {
			await markOwnRoleChange(guildId, userId, roleId, 'add');

			expect([...stored.keys()]).toEqual([`wolfstar:moderation:role-change:${guildId}:${userId}:${roleId}:add`]);
			await expect(takeOwnRoleChange(guildId, userId, roleId)).resolves.toBe(false);
			await expect(takeOwnRoleChange(guildId, userId, roleId, 'add')).resolves.toBe(true);
		});

		test('GIVEN no connection THEN nothing is remembered', async () => {
			redis.status = 'end';
			await markOwnRoleChange(guildId, userId, roleId);

			expect(stored.size).toBe(0);
			await expect(takeOwnRoleChange(guildId, userId, roleId)).resolves.toBe(false);
		});
	});
});
