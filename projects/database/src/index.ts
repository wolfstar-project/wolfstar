import 'varlock/auto-load';
import { lints } from '@prisma/orm-postgres/family-runtime';
import postgres from '@prisma/orm-postgres/runtime';
import { typedRuntimeDescriptor } from 'prisma-orm-extension-typed-json/runtime';
import type { Contract, Models } from './generated/prisma/contract.js';
import contractJson from './generated/prisma/contract.json' with { type: 'json' };

const connectionString = process.env.DATABASE_URL ?? '';

export const db = postgres<Contract>({
	url: connectionString,
	contractJson,
	extensions: [typedRuntimeDescriptor],
	// Refuses a `DELETE` or an `UPDATE` without a `WHERE` before it reaches the database:
	middleware: [lints()]
});

export type Database = typeof db;

export type { Contract, Models };

export * from './settings/columns.js';
export * from './settings/constants.js';
export * from './settings/storage.js';
export * from './settings/types.js';
