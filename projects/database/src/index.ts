import 'varlock/auto-load';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract, Models } from './generated/prisma/contract.js';
import contractJson from './generated/prisma/contract.json' with { type: 'json' };

const connectionString = process.env.DATABASE_URL ?? '';

export const db = postgres<Contract>({ url: connectionString, contractJson });

export type Database = typeof db;

export type { Contract, Models };

export * from './settings/constants.js';
export * from './settings/storage.js';
export * from './settings/types.js';
