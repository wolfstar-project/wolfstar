import { container } from '@wolfstar/http-framework';
import { prisma } from 'wolfstar-database';
import type { PrismaClient } from 'wolfstar-database';

container.prisma = prisma;

declare module '@sapphire/pieces' {
	interface Container {
		prisma: PrismaClient;
	}
}
