import { container } from '@wolfstar/http-framework';
import { db, type Database } from 'wolfstar-database';

container.prisma = db;

declare module '@sapphire/pieces' {
	interface Container {
		prisma: Database;
	}
}
