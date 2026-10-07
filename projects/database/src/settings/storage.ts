import type { Database } from '../index.js';
import { Columns, Tables, type Column, type ColumnKind, type StoredKey, type TableName } from './columns.js';
import { getDefaultGuildSettings } from './constants.js';
import type { GuildData, GuildDataKey, ReadonlyGuildData, StickyRole } from './types.js';
import type { Snowflake } from 'discord-api-types/v10';

const StoredKeys = Object.keys(Columns) as StoredKey[];
const ColumnsByKey: Record<StoredKey, Column> = Columns;

/**
 * The ORM surface of a table as the storage layer uses it. The tables are addressed by name, so the typed per-model
 * collections are narrowed to the three terminals every one of them shares.
 */
interface TableCollection {
	first(criteria: { id: bigint }): PromiseLike<Record<string, unknown> | null>;
	upsert(input: { create: Record<string, unknown>; update: Record<string, unknown> }): PromiseLike<unknown>;
}

type Orm = Database['orm'];

function table(orm: Pick<Orm, 'public'>, name: TableName): TableCollection {
	return orm.public[name] as unknown as TableCollection;
}

function toSetting(kind: ColumnKind, value: unknown): unknown {
	switch (kind) {
		case 'snowflake':
			return value === null || value === undefined ? null : String(value);
		case 'snowflakes':
			return (value as readonly bigint[]).map(String);
		case 'boolean':
			return value === true;
		case 'value':
			return value;
	}
}

function toColumn(kind: ColumnKind, value: unknown): unknown {
	switch (kind) {
		case 'snowflake':
			return value === null || value === undefined ? null : BigInt(value as string);
		case 'snowflakes':
			return (value as readonly string[]).map((entry) => BigInt(entry));
		case 'boolean':
		case 'value':
			return value;
	}
}

/**
 * Reads the settings of a guild.
 * @param orm The ORM surface to read through, `db.orm` or a transaction's `tx.orm`.
 * @param id The guild's ID.
 * @returns The settings, or `null` when the guild has no `Guild` row yet.
 */
export async function fetchGuildData(orm: Orm, id: Snowflake): Promise<GuildData | null> {
	const key = BigInt(id);
	const [rows, stickyRoles] = await Promise.all([
		Promise.all(Tables.map((name) => table(orm, name).first({ id: key }))),
		orm.public.StickyRole.where({ guildId: key }).all()
	]);

	const [guild] = rows;
	if (guild === null) return null;

	const data = Object.assign(Object.create(null), getDefaultGuildSettings(), { id }) as GuildData;
	const byTable = new Map<TableName, Record<string, unknown> | null>(Tables.map((name, index) => [name, rows[index]]));
	for (const settingKey of StoredKeys) {
		const { table: tableName, column, kind } = ColumnsByKey[settingKey];
		const row = byTable.get(tableName);
		// A missing row keeps the default values for every key the table stores:
		if (!row) continue;
		Reflect.set(data, settingKey, toSetting(kind, row[column]));
	}

	data.stickyRoles = stickyRoles.map((entry) => ({ user: String(entry.userId), roles: entry.roleIds.map(String) }) satisfies StickyRole);

	return data;
}

/**
 * Writes changed settings into their tables, in one transaction. The rows a change needs are created with the rest of
 * {@link settings} when they do not exist yet, together with the rows they reference.
 * @param db The database to write through.
 * @param settings The settings the changes apply to, with the changes already merged in.
 * @param changes The changed keys and their new values.
 */
export async function writeGuildData(db: Database, settings: ReadonlyGuildData, changes: Partial<ReadonlyGuildData>): Promise<void> {
	const id = BigInt(settings.id);
	const changedKeys = Object.keys(changes) as GuildDataKey[];

	const touched = new Set<TableName>();
	for (const key of changedKeys) {
		if (key === 'id') continue;
		if (key === 'stickyRoles') touched.add('Guild');
		else touched.add(ColumnsByKey[key].table);
	}

	if (touched.size === 0) return;

	// Every table references the chain above it, so the whole chain has to exist first:
	touched.add('Guild');
	if (touched.size > 1) touched.add('Modules');
	if ([...touched].some((name) => name.startsWith('GuildAutoModeration'))) touched.add('GuildAutoModeration');

	await db.transaction(async (tx) => {
		for (const name of Tables) {
			if (!touched.has(name)) continue;

			const create: Record<string, unknown> = { id };
			const update: Record<string, unknown> = {};
			for (const key of StoredKeys) {
				const { table: tableName, column, kind } = ColumnsByKey[key];
				if (tableName !== name) continue;

				const value = toColumn(kind, settings[key]);
				create[column] = value;
				if (key in changes) update[column] = value;
			}

			await table(tx.orm, name).upsert({ create, update });
		}

		if ('stickyRoles' in changes) {
			const stickyRoles = tx.orm.public.StickyRole;
			await stickyRoles.where({ guildId: id }).deleteAndCount();
			if (settings.stickyRoles.length > 0) {
				await stickyRoles.createAndCount(
					settings.stickyRoles.map((entry) => ({
						guildId: id,
						userId: BigInt(entry.user),
						roleIds: entry.roles.map((role) => BigInt(role))
					}))
				);
			}
		}
	});
}
