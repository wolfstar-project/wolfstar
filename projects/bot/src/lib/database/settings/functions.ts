import { getDefaultGuildSettings } from '#lib/database/settings/constants';
import { deleteSettingsContext, getSettingsContext, updateSettingsContext } from '#lib/database/settings/context/functions';
import { fetchGuildData, writeGuildData } from '#lib/database/settings/storage';
import type { AdderKey } from '#lib/database/settings/structures/AdderManager';
import type { GuildData, ReadonlyGuildData } from '#lib/database/settings/types';
import { AsyncQueue } from '@sapphire/async-queue';
import { container, type Awaitable } from '@sapphire/framework';
import { Collection, type GuildResolvable, type Snowflake } from 'discord.js';

const cache = new Collection<string, GuildData>();
const queue = new Collection<string, Promise<GuildData>>();
const locks = new Collection<string, AsyncQueue>();

export function serializeSettings(data: ReadonlyGuildData, space?: string | number) {
	return JSON.stringify(data, null, space);
}

export function deleteSettingsCached(guild: GuildResolvable) {
	const id = resolveGuildId(guild);
	locks.delete(id);
	cache.delete(id);
	deleteSettingsContext(id);
}

export function readSettings(guild: GuildResolvable): Awaitable<ReadonlyGuildData> {
	const id = resolveGuildId(guild);

	return cache.get(id) ?? processFetch(id);
}

export function readSettingsAdder(settings: ReadonlyGuildData, key: AdderKey) {
	return getSettingsContext(settings).adders[key];
}

export function readSettingsPermissionNodes(settings: ReadonlyGuildData) {
	return getSettingsContext(settings).permissionNodes;
}

export function readSettingsNoMentionSpam(settings: ReadonlyGuildData) {
	return getSettingsContext(settings).noMentionSpam;
}

export function readSettingsWordFilterRegExp(settings: ReadonlyGuildData) {
	return getSettingsContext(settings).wordFilterRegExp;
}

export function readSettingsCached(guild: GuildResolvable): ReadonlyGuildData | null {
	return cache.get(resolveGuildId(guild)) ?? null;
}

export function readSettingsAuditLog(settings: ReadonlyGuildData) {
	return getSettingsContext(settings).auditLog;
}

export async function writeSettings(
	guild: GuildResolvable,
	data: Partial<ReadonlyGuildData> | ((settings: ReadonlyGuildData) => Awaitable<Partial<ReadonlyGuildData>>),
	actorId?: string
) {
	using trx = await writeSettingsTransaction(guild);

	if (typeof data === 'function') {
		data = await data(trx.settings);
	}

	if (actorId) {
		await trx.write(data).submitWithAudit(actorId);
	} else {
		await trx.write(data).submit();
	}
}

export async function writeSettingsTransaction(guild: GuildResolvable) {
	const id = resolveGuildId(guild);
	const queue = locks.ensure(id, () => new AsyncQueue());

	// Acquire a write lock:
	await queue.wait();

	// Fetch the entry:
	const settings = cache.get(id) ?? (await unlockOnThrow(processFetch(id), queue));

	return new Transaction(settings, queue);
}

export class Transaction {
	#changes = Object.create(null) as Partial<ReadonlyGuildData>;
	#before = Object.create(null) as Record<string, unknown>;
	#hasChanges = false;
	#locking = true;

	public constructor(
		public readonly settings: ReadonlyGuildData,
		private readonly queue: AsyncQueue
	) {}

	public get hasChanges() {
		return this.#hasChanges;
	}

	public get locking() {
		return this.#locking;
	}

	public write(data: Partial<ReadonlyGuildData>) {
		for (const key of Object.keys(data)) {
			if (!(key in this.#before)) {
				(this.#before as Record<string, unknown>)[key] = (this.settings as Record<string, unknown>)[key];
			}
		}

		Object.assign(this.#changes, data);
		this.#hasChanges = true;
		return this;
	}

	public async submitWithAudit(actorId: string) {
		if (!this.#hasChanges) return;
		const before = { ...this.#before };
		await this.submit();
		const after = Object.fromEntries(Object.keys(before).map((key) => [key, (this.settings as Record<string, unknown>)[key]]));
		void readSettingsAuditLog(this.settings)
			.update(actorId, before, after)
			.catch(() => null);
	}

	public async submit() {
		if (!this.#hasChanges) {
			return;
		}

		try {
			// Write the merged settings, so the rows created for the first time carry every column and not just the changes:
			await writeGuildData({ ...this.settings, ...this.#changes }, this.#changes);

			Object.assign(this.settings, this.#changes);
			this.#hasChanges = false;
			updateSettingsContext(this.settings, this.#changes);
		} finally {
			this.#changes = Object.create(null);

			if (this.#locking) {
				this.queue.shift();
				this.#locking = false;
			}
		}
	}

	public abort() {
		if (this.#locking) {
			this.queue.shift();
			this.#locking = false;
		}
	}

	public dispose() {
		if (this.#locking) {
			this.queue.shift();
			this.#locking = false;
		}
	}

	public [Symbol.dispose]() {
		return this.dispose();
	}
}

async function unlockOnThrow(promise: Promise<ReadonlyGuildData>, lock: AsyncQueue) {
	try {
		return await promise;
	} catch (error) {
		lock.shift();
		throw error;
	}
}

async function processFetch(id: string): Promise<ReadonlyGuildData> {
	const previous = queue.get(id);
	if (previous) return previous;

	try {
		const promise = fetch(id);
		queue.set(id, promise);
		const value = await promise;
		getSettingsContext(value);
		return value;
	} finally {
		queue.delete(id);
	}
}

async function fetch(id: string): Promise<GuildData> {
	// A guild without rows reads as the defaults; its rows are created by the first write:
	const data =
		(await fetchGuildData(container.prisma.orm, id)) ?? (Object.assign(Object.create(null), getDefaultGuildSettings(), { id }) as GuildData);
	cache.set(id, data);
	return data;
}

/**
 * Resolves the ID of the guild a structure belongs to. The HTTP framework keeps no guild cache, so the ID is read from
 * the structure itself: a snowflake is a guild ID, a structure with a `guild` (a channel, a member, a role, an emoji, an
 * invite) belongs to that guild, and any other structure is a guild.
 */
function resolveGuildId(guild: GuildResolvable): Snowflake {
	if (typeof guild === 'string') return guild;

	const owner = 'guild' in guild ? guild.guild : null;
	const resolvedId = owner?.id ?? (guild as { id?: Snowflake }).id;
	if (!resolvedId) throw new TypeError(`Cannot resolve "guild" to a Guild instance.`);
	return resolvedId;
}
