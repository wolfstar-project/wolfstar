import { PrismaClient } from "#s/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { container } from "@wolfstar/http-framework";

const adapter = new PrismaPg({
	connectionString: `${process.env.DATABASE_URL}`,
});
const prisma = new PrismaClient({ adapter });
container.prisma = prisma;

declare module "@sapphire/pieces" {
	interface Container {
		prisma: PrismaClient;
	}
}
