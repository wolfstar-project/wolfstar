import 'varlock/auto-load';
import { lints } from '@prisma/orm-postgres/family-runtime';
import postgres from '@prisma/orm-postgres/runtime';
import { typedRuntimeDescriptor } from 'prisma-orm-extension-typed-json/runtime';
import type { Contract, Models } from './generated/prisma/contract.js';
import contractJson from './generated/prisma/contract.json' with { type: 'json' };

const connectionString = process.env.DATABASE_URL ?? '';

/**
 * How long a connection of the pool stays open unused before it is closed.
 *
 * @remarks The default of the runtime (30 seconds) is shorter than the gap between most commands and between the runs
 * of the tasks that poll every minute, so they kept opening new connections: 32ms each at the median and 336ms at the
 * 95th percentile on Railway, where a query on an open one takes 2ms.
 */
const PoolIdleTimeout = 10 * 60 * 1000;

export const db = postgres<Contract>({
	url: connectionString,
	poolOptions: { idleTimeoutMillis: PoolIdleTimeout },
	contractJson,
	extensions: [typedRuntimeDescriptor],
	// Refuses a `DELETE` or an `UPDATE` without a `WHERE` before it reaches the database:
	middleware: [lints()]
});

export type Database = typeof db;

export type { Contract, Models };

export { convertLegacyAutomodRules } from './legacy/automod.js';
export * from './legacy/migrate.js';
export * from './legacy/storage.js';
export { LegacyValueError, type LegacyRow } from './legacy/types.js';
export * from './settings/automod/storage.js';
export * from './settings/appeals/forms.js';
export * from './settings/appeals/requests.js';
export * from './settings/appeals/storage.js';
export * from './settings/appeals/types.js';
export * from './settings/automod/types.js';
export * from './settings/cases/storage.js';
export * from './settings/cases/types.js';
export * from './settings/cleanup/storage.js';
export * from './settings/cleanup/types.js';
export * from './settings/histories/storage.js';
export * from './settings/messages/storage.js';
export * from './settings/messages/types.js';
export * from './settings/nicknames/storage.js';
export * from './settings/reasons/storage.js';
export * from './settings/roles/storage.js';
export * from './settings/warnings/storage.js';
export * from './settings/columns.js';
export * from './settings/access.js';
export * from './settings/permissions.js';
export * from './settings/constants.js';
export * from './settings/honeypot/storage.js';
export * from './settings/joinguard/storage.js';
export * from './settings/joinguard/types.js';
export * from './settings/reports/storage.js';
export * from './settings/reports/types.js';
export * from './settings/storage.js';
export * from './settings/time.js';
export * from './settings/types.js';
