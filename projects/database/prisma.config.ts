import 'dotenv/config';
import { definePrismaConfig } from 'prisma/config';
import { defineConfig as definePostgresConfig } from '@prisma/orm-postgres/config';

export default definePrismaConfig({
	orm: definePostgresConfig({
		contract: 'src/contract.prisma',
		output: 'src/generated/prisma',
		db: {
			connection: process.env['DATABASE_URL'] ?? ''
		}
	})
});
