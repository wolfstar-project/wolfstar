import { readSettings, writeSettings } from '#lib/database';
import { type StickyRole } from 'wolfstar-database';
import { isNullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';

export interface StickyRoleManagerExtraContext {
	author: string;
}

/**
 * Manages the sticky roles of a guild, which are stored in the `stickyRoles`
 * setting, one entry per user with the IDs of their roles.
 */
export class StickyRoleManager {
	readonly #guild: Guild;

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
			// 3.0.a. Then delete the entry from the settings:
			await this.clear(userId);
			return roles;
		}

		// 3.0.b. Write the fixed roles array:
		const removed = new Set(entry.filter((role) => !roles.includes(role)));
		let result: readonly string[] = [];
		await writeSettings(this.#guild, (settings) => {
			// The entry may have been removed while cleaning the roles:
			const current = settings.stickyRoles.find((sticky) => sticky.user === userId);
			if (!current) return {};

			// Or a role added to it, so the roles that are gone are taken out of the entry as it is now:
			result = current.roles.filter((role) => !removed.has(role));
			return { stickyRoles: this.#patch(settings.stickyRoles, userId, result) };
		});

		// 4.0. Return the updated roles:
		return result;
	}

	public async add(userId: string, roleId: string): Promise<readonly string[]> {
		let result: readonly string[] = [];
		await writeSettings(this.#guild, async (settings) => {
			// 1.0. Get the entry:
			const entry = settings.stickyRoles.find((sticky) => sticky.user === userId);

			// 2.0. Append the role to the entry, or create a new sticky roles entry:
			result = entry ? await this.addRole(roleId, entry.roles) : [roleId];

			// 3.0. Write the new roles:
			return { stickyRoles: this.#patch(settings.stickyRoles, userId, result) };
		});

		// 4.0. Return the updated roles:
		return result;
	}

	public async remove(userId: string, roleId: string): Promise<readonly string[]> {
		let result: readonly string[] = [];
		await writeSettings(this.#guild, async (settings) => {
			// 1.0. Get the entry, if the entry does not exist, there is nothing to do:
			const entry = settings.stickyRoles.find((sticky) => sticky.user === userId);
			if (isNullish(entry)) return {};

			// 2.0. Read the previous entry and patch it by removing the role:
			const roles = await this.removeRole(roleId, entry.roles);

			// 3.0. Write the patched roles (an empty array deletes the entry):
			result = entry.roles;
			return { stickyRoles: this.#patch(settings.stickyRoles, userId, roles) };
		});

		// 4.0. Return the previous roles:
		return result;
	}

	public async clear(userId: string): Promise<readonly string[]> {
		let result: readonly string[] = [];
		await writeSettings(this.#guild, (settings) => {
			// 1.0. Get the entry, if the entry does not exist, there is nothing to do:
			const entry = settings.stickyRoles.find((sticky) => sticky.user === userId);
			if (isNullish(entry)) return {};

			// 2.0. Remove the entry from the settings:
			result = entry.roles;
			return { stickyRoles: this.#patch(settings.stickyRoles, userId, []) };
		});

		// 3.0. Return the previous roles:
		return result;
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

	async #read(userId: string): Promise<readonly string[] | null> {
		const { stickyRoles } = await readSettings(this.#guild);
		return stickyRoles.find((sticky) => sticky.user === userId)?.roles ?? null;
	}

	/** Replaces the roles of a user, an empty `roles` array removes the entry. */
	#patch(entries: readonly StickyRole[], userId: string, roles: readonly string[]): StickyRole[] {
		const others = entries.filter((sticky) => sticky.user !== userId);
		return roles.length === 0 ? others : [...others, { user: userId, roles }];
	}
}
