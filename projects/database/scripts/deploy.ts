import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

type Environment = Record<string, string | undefined>;

/**
 * Whether a process brings the schema up to date before it starts: the ones of an image, which sets `NODE_ENV`, so a
 * local `pnpm start` leaves a database that was not made by these migrations alone, but a worker of the broker, whose
 * gateway does it.
 */
export function shouldDeploy(env: Environment): boolean {
	return env.NODE_ENV === 'production' && env.BOT_MODE !== 'worker';
}

/**
 * The connection a migration runs on: `DATABASE_MIGRATION_URL` when it is set, since a transaction pooler does not keep
 * what a migration holds between statements, else the one of the bot.
 */
export function resolveMigrationUrl(env: Environment): string {
	const url = env.DATABASE_MIGRATION_URL || env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is not set.');
	return url;
}

/**
 * Applies `legacy/schema.sql` when the database has no `Guild` table, under a lock, so two processes do not do it twice.
 * The tables of the new schema have other names than the legacy ones, so they live side by side.
 */
async function applySchema(url: string) {
	const { default: pg } = await import('pg');
	const client = new pg.Client({ connectionString: url });
	await client.connect();

	try {
		await client.query('BEGIN');
		await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('deploy:schema', 0))`);
		const { rows } = await client.query<{ table: string | null }>(`SELECT to_regclass('public."Guild"')::text AS "table"`);
		if (rows[0].table === null) {
			console.log('[deploy] The database has no schema, applying it.');
			await client.query(await readFile(new URL('../legacy/schema.sql', import.meta.url), 'utf8'));
		}

		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK').catch(() => null);
		throw error;
	} finally {
		await client.end();
	}
}

/**
 * Applies the migrations the database does not have, on the connection the environment gives `prisma.config.ts`.
 */
function applyMigrations(url: string) {
	const { status } = spawnSync('pnpm', ['exec', 'prisma', 'db', 'migrate'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' });
	if (status !== 0) throw new Error(`prisma db migrate exited with ${status}.`);
}

async function main() {
	await import('varlock/auto-load');
	if (!shouldDeploy(process.env)) return;

	const url = resolveMigrationUrl(process.env);
	await applySchema(url);
	applyMigrations(url);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
