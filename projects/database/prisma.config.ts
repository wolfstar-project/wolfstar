import 'varlock/auto-load';
import { definePrismaConfig } from 'prisma/config';
import { defineConfig as definePostgresConfig } from '@prisma/orm-postgres/config';
import { typedExtensionDescriptor } from 'prisma-orm-extension-typed-json/control';

export default definePrismaConfig({
	orm: definePostgresConfig({
		contract: 'src/contract.prisma',
		output: 'src/generated/prisma',
		extensions: [typedExtensionDescriptor],
		db: {
			connection: process.env['DATABASE_URL'] ?? ''
		}
	})
});
