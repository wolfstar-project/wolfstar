// Config must be the first to be loaded, as it sets the env:
import '#root/config';

// Import everything else:
import { envParseBoolean, envParseString } from '@skyra/env-utilities';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

export const AppDataConfig = new DataSource({
	type: 'postgres',
	url: envParseString('PGSQL_DATABASE_URL'),
	entities: [fileURLToPath(new URL('entities/*Entity.js', import.meta.url))],
	migrations: [fileURLToPath(new URL('migrations/*.js', import.meta.url))],
	namingStrategy: new SnakeNamingStrategy(),
	logging: envParseBoolean('TYPEORM_DEBUG_LOGS', false)
});

export const connect = () => AppDataConfig.initialize();
