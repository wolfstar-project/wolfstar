import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import postgres from '@prisma/orm-postgres/runtime';
import { PrismaClient } from './generated/prisma/client.js';
import type { Contract } from './generated/prisma8/contract.js';
import contractJson from './generated/prisma8/contract.json' with { type: 'json' };

interface GetDbParams {
	connectionString: string;
}

function getDb({ connectionString }: GetDbParams) {
	const pool = new PrismaPg({ connectionString });

	const prisma = new PrismaClient({ adapter: pool });

	return prisma;
}

const connectionString = process.env.DATABASE_URL ?? '';

/**
 * Prisma ORM 7 client. Every existing consumer still reads and writes through this.
 */
const prisma = getDb({ connectionString });

/**
 * Prisma ORM 8 client, running against the same database as {@link prisma}.
 * Consumers migrate onto this one at a time; see the upgrade guide at
 * https://www.prisma.io/docs/guides/upgrade-prisma-orm/postgresql
 */
export const db = postgres<Contract>({ url: connectionString, contractJson });

export type { PrismaClient } from './generated/prisma/client.js';

export { prisma };
export default prisma;
