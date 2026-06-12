import { PrismaClient } from './generated/client/index.js';
import { PrismaPg } from "@prisma/adapter-pg";

interface GetDbParams {
	connectionString: string;
}

function getDb({ connectionString }: GetDbParams) {
	const pool = new PrismaPg({ connectionString });

	const prisma = new PrismaClient({ adapter: pool });

	return prisma;
}
const databaseUrl = process.env.DATABASE_URL;
const prisma = getDb({ connectionString: databaseUrl! });
export default prisma;
