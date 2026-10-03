import { readSettings } from '#lib/database/settings';
import type { GuildTextBasedChannel } from '#lib/moderation/managers/LoggerManager';
import { ModerationManagerEntry } from '#lib/moderation/managers/ModerationManagerEntry';
import { toModerationRow } from '#lib/moderation/managers/ModerationRecord';
import { SortedCollection } from '#lib/structures/data';
import { Events } from '#lib/types';
import { createReferPromise, desc, floatPromise, minutes, orMix, seconds, type BooleanFn, type ReferredPromise } from '#utils/common';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import { AsyncQueue } from '@sapphire/async-queue';
import { isNullish } from '@sapphire/utilities';
import { UserError, container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';
import type { Snowflake } from 'discord-api-types/v10';

enum CacheActions {
	None,
	Fetch,
	Insert
}

export class ModerationManager {
	/**
	 * The Guild instance that manages this manager
	 */
	public readonly guild: Guild;

	/**
	 * The cache of the moderation entries, sorted by their case ID in
	 * descending order.
	 */
	readonly #cache = new SortedCollection<number, ModerationManagerEntry>(undefined, desc);

	/**
	 * A queue for save tasks, prevents case_id duplication
	 */
	readonly #saveQueue = new AsyncQueue();

	/**
	 * The latest moderation case ID.
	 */
	#latest: number | null = null;

	/**
	 * The amount of moderation cases in the database.
	 */
	#count: number | null = null;

	/**
	 * The timer that sweeps this manager's entries
	 */
	#timer: NodeJS.Timeout | null = null;

	/**
	 * The promise to wait for tasks to complete
	 */
	readonly #locks: ReferredPromise<void>[] = [];

	get #table() {
		return container.prisma.orm.public.ModerationAction;
	}

	get #guildId() {
		return BigInt(this.guild.id);
	}

	public constructor(guild: Guild) {
		this.guild = guild;
	}

	/**
	 * The channel where messages have to be sent.
	 */
	public async fetchChannel() {
		const settings = await readSettings(this.guild);
		const channelId = settings.channelsLogsModeration;
		if (isNullish(channelId)) return null;
		const channel = await container.gatewayClient.channels.cache.get(channelId);
		if (isNullish(channel) || !('send' in channel) || !('guildId' in channel) || channel.guildId !== this.guild.id) return null;
		return channel as GuildTextBasedChannel;
	}

	/**
	 * Retrieves the latest recent cached entry for a given user created in the last 30 seconds.
	 *
	 * @param userId - The ID of the user.
	 * @returns The latest recent cached entry for the user, or `null` if no entry is found.
	 */
	public getLatestRecentCachedEntryForUser(userId: string) {
		const minimumTime = Date.now() - seconds(30);
		for (const entry of this.#cache.values()) {
			if (entry.userId !== userId) continue;
			if (entry.createdAt < minimumTime) break;
			return entry;
		}

		return null;
	}

	public create<Type extends TypeVariation = TypeVariation>(data: ModerationManager.CreateData<Type>): ModerationManager.Entry<Type> {
		return new ModerationManagerEntry({
			id: -1,
			createdAt: -1,
			...data,
			duration: data.duration ?? null,
			extraData: data.extraData ?? (null as ModerationManager.ExtraData<Type>),
			guild: this.guild,
			moderator: data.moderator ?? process.env.CLIENT_ID,
			reason: data.reason ?? null,
			imageURL: data.imageURL ?? null,
			metadata: data.metadata ?? TypeMetadata.None
		});
	}

	public async insert(data: ModerationManager.Entry): Promise<ModerationManager.Entry> {
		await this.#saveQueue.wait();

		try {
			const id = (await this.getCurrentId()) + 1;
			const entry = new ModerationManagerEntry({ ...data.toData(), id, createdAt: Date.now() });
			await this.#performInsert(entry);
			return this.#addToCache(entry, CacheActions.Insert);
		} finally {
			this.#saveQueue.shift();
		}
	}

	/**
	 * Edits a moderation entry.
	 *
	 * @param entryOrId - The entry or ID of the moderation entry to edit.
	 * @param data - The updated data for the moderation entry.
	 * @returns The updated moderation entry.
	 */
	public async edit(entryOrId: ModerationManager.EntryResolvable, data: ModerationManager.UpdateData) {
		const entry = await this.#resolveEntry(entryOrId);
		return this.#performUpdate(entry, data);
	}

	/**
	 * Edits the {@linkcode ModerationManagerEntry.metadata} field from a moderation entry to set
	 * {@linkcode TypeMetadata.Archived}.
	 *
	 * @param entryOrId - The moderation entry or its ID.
	 * @returns The updated moderation entry.
	 */
	public async archive(entryOrId: ModerationManager.EntryResolvable) {
		const entry = await this.#resolveEntry(entryOrId);
		if (entry.isArchived()) return entry;
		return this.#performUpdate(entry, { metadata: entry.metadata | TypeMetadata.Archived });
	}

	/**
	 * Edits the {@linkcode ModerationManagerEntry.metadata} field from a moderation entry to set
	 * {@linkcode TypeMetadata.Completed}.
	 *
	 * @param entryOrId - The moderation entry or its ID.
	 * @returns The updated moderation entry.
	 */
	public async complete(entryOrId: ModerationManager.EntryResolvable) {
		const entry = await this.#resolveEntry(entryOrId);
		if (entry.isCompleted()) return entry;
		return this.#performUpdate(entry, { metadata: entry.metadata | TypeMetadata.Completed });
	}

	/**
	 * Deletes a moderation entry.
	 *
	 * @param entryOrId - The moderation entry or its ID to delete.
	 * @returns The deleted moderation entry.
	 */
	public async delete(entryOrId: ModerationManager.EntryResolvable) {
		const entry = await this.#resolveEntry(entryOrId);

		// Delete the task if it exists
		const { task } = entry;
		if (task) await task.delete();

		// Delete the entry from the DB and the cache
		await this.#table.where({ id: entry.id, guildId: this.#guildId }).deleteAndCount();
		this.#cache.delete(entry.id);

		return entry;
	}

	/**
	 * Fetches a moderation entry from the cache or the database.
	 *
	 * @remarks
	 *
	 * If the entry is not found, it returns null.
	 *
	 * @param id - The ID of the moderation entry to fetch.
	 * @returns The fetched moderation entry, or `null` if it was not found.
	 */
	public async fetch(id: number): Promise<ModerationManager.Entry | null>;
	/**
	 * Fetches multiple moderation entries from the cache or the database.
	 *
	 * @param options - The options to fetch the moderation entries.
	 * @returns The fetched moderation entries, sorted by
	 * {@link ModerationManagerEntry.id} in descending order.
	 */
	public async fetch(options?: ModerationManager.FetchOptions): Promise<SortedCollection<number, ModerationManager.Entry>>;
	public async fetch(
		options: number | ModerationManager.FetchOptions = {}
	): Promise<ModerationManager.Entry | SortedCollection<number, ModerationManager.Entry> | null> {
		// Case number
		if (typeof options === 'number') {
			return this.#getSingle(options) ?? this.#addToCache(await this.#fetchSingle(options), CacheActions.None);
		}

		if (options.moderatorId || options.userId) {
			return this.#count === this.#cache.size //
				? this.#getMany(options)
				: this.#addToCache(await this.#fetchMany(options), CacheActions.None);
		}

		if (this.#count !== this.#cache.size) {
			this.#addToCache(await this.#fetchAll(), CacheActions.Fetch);
		}

		return this.#cache;
	}

	public async getCurrentId(): Promise<number> {
		if (this.#latest === null) {
			const result = await this.#table.where({ guildId: this.#guildId }).aggregate((aggregate) => ({
				count: aggregate.count(),
				latest: aggregate.max('id')
			}));

			this.#count = result.count;
			this.#latest = result.latest ?? 0;
		}

		return this.#latest;
	}

	public createLock() {
		// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
		const lock = createReferPromise<void>();
		this.#locks.push(lock);
		floatPromise(
			lock.promise.finally(() => {
				this.#locks.splice(this.#locks.indexOf(lock), 1);
			})
		);

		return () => lock.resolve();
	}

	public releaseLock() {
		for (const lock of this.#locks) lock.resolve();
	}

	public waitLock() {
		return Promise.all(this.#locks.map((lock) => lock.promise));
	}

	/**
	 * Checks if a moderation entry has been created for a given type and user
	 * within the last minute.
	 *
	 * @remarks
	 *
	 * This is useful to prevent duplicate moderation entries from being created
	 * when a user is banned, unbanned, or softbanned multiple times in a short.
	 *
	 * @param type - The type of moderation action.
	 * @param userId - The ID of the user.
	 * @returns A boolean indicating whether a moderation entry has been created.
	 */
	public checkSimilarEntryHasBeenCreated(type: TypeVariation, userId: Snowflake) {
		const minimumTime = Date.now() - minutes(1);
		const checkSoftBan = type === TypeVariation.Ban;
		for (const entry of this.#cache.values()) {
			// If it's not the same user target or if it's at least 1 minute old, skip:
			if (userId !== entry.userId || entry.createdAt < minimumTime) continue;

			// If there was a log with the same type in the last minute, return true:
			if (type === entry.type) return true;

			// If this log is a ban or an unban, but the user was softbanned recently, return true:
			if (checkSoftBan && entry.type === TypeVariation.Softban) return true;
		}

		// No similar entry has been created in the last minute:
		return false;
	}

	#addToCache(entry: ModerationManagerEntry | null, type: CacheActions): ModerationManagerEntry;
	#addToCache(entries: ModerationManagerEntry[], type: CacheActions): SortedCollection<number, ModerationManagerEntry>;
	#addToCache(
		entries: ModerationManagerEntry | ModerationManagerEntry[] | null,
		type: CacheActions
	): SortedCollection<number, ModerationManagerEntry> | ModerationManagerEntry | null {
		if (!entries) return null;

		const parsedEntries = Array.isArray(entries) ? entries : [entries];

		for (const entry of parsedEntries) {
			this.#cache.set(entry.id, entry);
		}

		if (type === CacheActions.Insert) {
			this.#count! += parsedEntries.length;
			this.#latest! += parsedEntries.length;
		}

		if (!this.#timer) {
			this.#timer = setInterval(() => {
				this.#cache.sweep((value) => value.cacheExpired);
				if (!this.#cache.size) this.#timer = null;
			}, seconds(30));
		}

		return Array.isArray(entries)
			? new SortedCollection(
					entries.map((entry) => [entry.id, entry]),
					desc
				)
			: entries;
	}

	async #resolveEntry(entryOrId: ModerationManager.EntryResolvable) {
		if (typeof entryOrId === 'number') {
			const entry = await this.fetch(entryOrId);
			if (isNullish(entry)) {
				throw new UserError({ identifier: 'arguments:caseUnknownEntry', context: { parameter: entryOrId } });
			}

			return entry;
		}

		if (entryOrId.guild.id !== this.guild.id) {
			throw new UserError({ identifier: 'arguments:caseNotInThisGuild', context: { parameter: entryOrId.id } });
		}

		return entryOrId;
	}

	#getSingle(id: number): ModerationManagerEntry | null {
		return this.#cache.get(id) ?? null;
	}

	async #fetchSingle(id: number): Promise<ModerationManagerEntry | null> {
		const row = await this.#table.where({ id, guildId: this.#guildId }).first();
		return row && ModerationManagerEntry.from(this.guild, row);
	}

	#getMany(options: ModerationManager.FetchOptions): SortedCollection<number, ModerationManagerEntry> {
		const fns: BooleanFn<[ModerationManagerEntry]>[] = [];
		if (options.userId) fns.push((entry) => entry.userId === options.userId);
		if (options.moderatorId) fns.push((entry) => entry.moderatorId === options.moderatorId);

		const fn = orMix(...fns);
		return this.#cache.filter((entry) => fn(entry));
	}

	async #fetchMany(options: ModerationManager.FetchOptions): Promise<ModerationManagerEntry[]> {
		let collection = this.#table.where({ guildId: this.#guildId });
		if (options.moderatorId) collection = collection.where({ moderatorId: BigInt(options.moderatorId) });
		if (options.userId) collection = collection.where({ targetId: BigInt(options.userId) });

		const rows = await collection.all();
		return rows.map((row) => ModerationManagerEntry.from(this.guild, row));
	}

	async #fetchAll(): Promise<ModerationManagerEntry[]> {
		const rows = await this.#table.where({ guildId: this.#guildId }).all();
		return rows.map((row) => ModerationManagerEntry.from(this.guild, row));
	}

	async #performInsert(entry: ModerationManager.Entry) {
		await this.#table.create(toModerationRow(entry.toJSON()));

		container.client.emit(Events.ModerationEntryAdd, entry);
		return entry;
	}

	async #performUpdate(entry: ModerationManager.Entry, data: ModerationManager.UpdateData) {
		const count = await this.#table.where({ id: entry.id, guildId: this.#guildId }).updateAndCount(this.#toUpdateRow(entry, data));
		if (count === 0) return entry;

		const clone = entry.clone();
		entry.patch(data);
		container.client.emit(Events.ModerationEntryEdit, clone, entry);
		return entry;
	}

	/**
	 * Converts the update data into the columns of the table that changed.
	 *
	 * @remarks
	 *
	 * The duration and the metadata are encoded together with the type of the
	 * entry, which is why the entry is required.
	 */
	#toUpdateRow(entry: ModerationManager.Entry, data: ModerationManager.UpdateData) {
		const patched = entry.clone();
		patched.patch(data);

		const row = toModerationRow(patched.toJSON());
		return {
			...(data.reason === undefined ? {} : { reason: row.reason }),
			...(data.duration === undefined ? {} : { duration: row.duration }),
			...(data.metadata === undefined && data.duration === undefined ? {} : { metadata: row.metadata, action: row.action })
		};
	}
}

export namespace ModerationManager {
	export interface FetchOptions {
		userId?: Snowflake;
		moderatorId?: Snowflake;
	}

	export type Entry<Type extends TypeVariation = TypeVariation> = Readonly<ModerationManagerEntry<Type>>;
	export type EntryResolvable<Type extends TypeVariation = TypeVariation> = Entry<Type> | number;

	export type CreateData<Type extends TypeVariation = TypeVariation> = ModerationManagerEntry.CreateData<Type>;
	export type UpdateData<Type extends TypeVariation = TypeVariation> = ModerationManagerEntry.UpdateData<Type>;

	export type ExtraData<Type extends TypeVariation = TypeVariation> = ModerationManagerEntry.ExtraData<Type>;
}
