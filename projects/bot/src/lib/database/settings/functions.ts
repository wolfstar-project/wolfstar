import { deleteSettingsContext, getSettingsContext, updateSettingsContext } from '#lib/database/settings/context/functions';
import { broadcastShardMessage, onShardMessage } from '#lib/sharder/messages';
import { acquireSharedLock } from '#utils/locks';
import { fetchGuildData, getDefaultGuildSettings, writeGuildData, type GuildData, type ReadonlyGuildData } from 'wolfstar-database';
import { AsyncQueue } from '@sapphire/async-queue';
import type { Awaitable } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { Collection } from '@discordjs/collection';
import type { GuildResolvable } from '@wolfstar/plugin-gateway';
import type { Snowflake } from 'discord-api-types/v10';

const cache = new Collection<string, GuildData>();
const queue = new Collection<string, Promise<GuildData>>();
const locks = new Collection<string, AsyncQueue>();

export function serializeSettings(data: ReadonlyGuildData, space?: string | number) {
	return JSON.stringify(data, null, space);
}

export function deleteSettingsCached(guild: GuildResolvable) {
	const id = resolveGuildId(guild);
	locks.delete(id);
	invalidate(id);
}

// The settings are cached by every shard process, so a write in one of them makes the copies of the others stale. The
// lock is kept: a transaction of this process may be holding it.
onShardMessage('settingsUpdate', ({ guildId }) => invalidate(guildId));

export function readSettings(guild: GuildResolvable): Awaitable<ReadonlyGuildData> {
	const id = resolveGuildId(guild);

	return cache.get(id) ?? processFetch(id);
}

export function readSettingsPermissionNodes(settings: ReadonlyGuildData) {
	return getSettingsContext(settings).permissionNodes;
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

	// The lock of the queue is of this process, the shared one is of every process that writes the settings:
	const release = await acquireSharedLock(`settings:${id}`);
	const unlock = () => {
		queue.shift();
		void release();
	};

	try {
		// Another process may have written since this one cached the settings, and its notification may not be here
		// yet: under the shared lock the settings are read again, so the write is made on what the database has.
		const settings = container.redis?.status === 'ready' ? await processFetch(id, true) : (cache.get(id) ?? (await processFetch(id)));
		return new Transaction(settings, unlock);
	} catch (error) {
		unlock();
		throw error;
	}
}

export class Transaction {
	#changes = Object.create(null) as Partial<ReadonlyGuildData>;
	#before = Object.create(null) as Record<string, unknown>;
	#hasChanges = false;
	#locking = true;

	public constructor(
		public readonly settings: ReadonlyGuildData,
		private readonly unlock: () => void
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
			await writeGuildData(container.prisma, { ...this.settings, ...this.#changes }, this.#changes);

			Object.assign(this.settings, this.#changes);
			this.#hasChanges = false;
			updateSettingsContext(this.settings, this.#changes);
			broadcastShardMessage({ type: 'settingsUpdate', guildId: this.settings.id });
		} finally {
			this.#changes = Object.create(null);

			if (this.#locking) {
				this.unlock();
				this.#locking = false;
			}
		}
	}

	public abort() {
		if (this.#locking) {
			this.unlock();
			this.#locking = false;
		}
	}

	public dispose() {
		if (this.#locking) {
			this.unlock();
			this.#locking = false;
		}
	}

	public [Symbol.dispose]() {
		return this.dispose();
	}
}

/**
 * Reads the settings of a guild from the database, once for the callers that ask at the same time.
 *
 * @param fresh - Whether a read that is already running is not enough: it may have started before a write.
 */
async function processFetch(id: string, fresh = false): Promise<ReadonlyGuildData> {
	const previous = queue.get(id);
	if (previous && !fresh) return previous;

	const promise = fetch(id);
	queue.set(id, promise);
	try {
		const value = await promise;
		getSettingsContext(value);
		return value;
	} finally {
		if (queue.get(id) === promise) queue.delete(id);
	}
}

/**
 * How many times the settings of a guild were invalidated. A read that started before an invalidation holds what the
 * database had then, so it does not go in the cache.
 */
const generations = new Collection<string, number>();

function invalidate(id: string) {
	generations.set(id, (generations.get(id) ?? 0) + 1);
	cache.delete(id);
	deleteSettingsContext(id);
}

async function fetch(id: string): Promise<GuildData> {
	const generation = generations.get(id) ?? 0;
	// A guild without rows reads as the defaults; its rows are created by the first write:
	const data =
		(await fetchGuildData(container.prisma.orm, id)) ?? (Object.assign(Object.create(null), getDefaultGuildSettings(), { id }) as GuildData);
	if ((generations.get(id) ?? 0) === generation) cache.set(id, data);
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
