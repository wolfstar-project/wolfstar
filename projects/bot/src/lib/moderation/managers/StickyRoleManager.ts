import { AsyncQueue } from '@sapphire/async-queue';
import { isNullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';

export interface StickyRoleManagerExtraContext {
	author: string;
}

/**
 * Manages the sticky roles of a guild, which are stored in the `StickyRole`
 * table, one row per user with the IDs of their roles.
 */
export class StickyRoleManager {
	readonly #guild: Guild;

	/**
	 * The queue that serializes the writes, so two concurrent read-modify-write
	 * operations for the same guild do not overwrite each other.
	 */
	readonly #queue = new AsyncQueue();

	public constructor(guild: Guild) {
		this.#guild = guild;
	}

	public async get(userId: string): Promise<readonly string[]> {
		return (await this.#read(userId)) ?? [];
	}

	public async has(userId: string, roleId: string): Promise<boolean> {
		const roles = await this.get(userId);
		return roles.includes(roleId);
	}

	public async fetch(userId: string): Promise<readonly string[]> {
		// 1.0. If the entry does not exist, return empty array
		const entry = await this.#read(userId);
		if (isNullish(entry)) return [];

		// 2.0. Read the entry and clean the roles:
		const roles = await this.cleanRoles(entry);

		// 2.1. If the roles are unchanged (have the same size), return them:
		if (entry.length === roles.length) return entry;

		// 2.2. If the roles are changed and leds to an empty array:
		if (roles.length === 0) {
			// 3.0.a. Then delete the entry from the table:
			await this.clear(userId);
			return roles;
		}

		// 3.0.b. Write the fixed roles array:
		return this.#withLock(async () => {
			// The entry may have been removed while cleaning the roles:
			if (isNullish(await this.#read(userId))) return [];

			await this.#write(userId, roles);

			// 4.0. Return the updated roles:
			return roles;
		});
	}

	public async add(userId: string, roleId: string): Promise<readonly string[]> {
		return this.#withLock(async () => {
			// 1.0. Get the entry:
			const entry = await this.#read(userId);

			// 2.0. If the entry does not exist:
			if (isNullish(entry)) {
				// 3.0.a. Proceed to create a new sticky roles entry:
				const roles = [roleId];
				await this.#write(userId, roles);
				return roles;
			}

			// 3. Get the entry and append the role:
			const roles = await this.addRole(roleId, entry);

			// 4. Write the new roles to the table:
			await this.#write(userId, roles);

			// 5. Return the updated roles:
			return roles;
		});
	}

	public async remove(userId: string, roleId: string): Promise<readonly string[]> {
		return this.#withLock(async () => {
			// 1.0. Get the entry:
			const entry = await this.#read(userId);

			// 1.1. If the entry does not exist, return empty array:
			if (isNullish(entry)) return [];

			// 2.0. Read the previous entry and patch it by removing the role:
			const roles = await this.removeRole(roleId, entry);

			if (roles.length === 0) {
				// 3.1.a. Then delete the entry from the table:
				await this.#delete(userId);
			} else {
				// 3.1.b. Otherwise patch it:
				await this.#write(userId, roles);
			}

			// 4.0. Return the previous roles:
			return entry;
		});
	}

	public async clear(userId: string): Promise<readonly string[]> {
		return this.#withLock(async () => {
			// 1.0. Get the entry:
			const entry = await this.#read(userId);

			// 1.1. If the entry does not exist, return empty array:
			if (isNullish(entry)) return [];

			// 2.0. Remove the entry from the table:
			await this.#delete(userId);

			// 3.0. Return the previous roles:
			return entry;
		});
	}

	private async addRole(roleId: string, roleIds: readonly string[]) {
		const emitted = new Set<string>(await this.cleanRoles(roleIds));
		emitted.add(roleId);
		return [...emitted];
	}

	private async removeRole(roleId: string, roleIds: readonly string[]) {
		const emitted = new Set<string>(await this.cleanRoles(roleIds));
		emitted.delete(roleId);
		return [...emitted];
	}

	/**
	 * Removes the duplicates and the roles that do not exist in the guild.
	 *
	 * @remarks
	 *
	 * The roles are checked against the cache, and only when any of them is
	 * missing the roles are fetched from the API, to not remove the roles of the
	 * members when the cache is not warm.
	 *
	 * @param roleIds - The role IDs to clean.
	 */
	private async cleanRoles(roleIds: readonly string[]): Promise<string[]> {
		const unique = [...new Set(roleIds)];
		if (unique.length === 0) return unique;

		const { roles } = container.gatewayClient;
		const cached = await Promise.all(unique.map((roleId) => roles.cache.get(roles.resolveKey(this.#guild.id, roleId))));
		if (cached.every((role) => !isNullish(role))) return unique;

		const existing = new Set((await roles.fetchAll(this.#guild.id)).map((role) => role.id));
		return unique.filter((roleId) => existing.has(roleId));
	}

	get #table() {
		return container.prisma.orm.public.StickyRole;
	}

	get #guildId() {
		return BigInt(this.#guild.id);
	}

	async #read(userId: string): Promise<readonly string[] | null> {
		const row = await this.#table.where({ userId: BigInt(userId), guildId: this.#guildId }).first();
		return row === null ? null : row.roleIds.map((roleId) => roleId.toString());
	}

	async #write(userId: string, roleIds: readonly string[]) {
		const data = { userId: BigInt(userId), guildId: this.#guildId, roleIds: roleIds.map((roleId) => BigInt(roleId)) };
		await this.#table.upsert({ create: data, update: { roleIds: data.roleIds } });
	}

	async #delete(userId: string) {
		await this.#table.where({ userId: BigInt(userId), guildId: this.#guildId }).deleteAndCount();
	}

	async #withLock<T>(fn: () => Promise<T>): Promise<T> {
		await this.#queue.wait();
		try {
			return await fn();
		} finally {
			this.#queue.shift();
		}
	}
}
