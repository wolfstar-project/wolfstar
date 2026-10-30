import { readFile } from 'node:fs/promises';
import { resolveSchemaStep, resolveMigrationUrl, shouldDeploy } from '../scripts/deploy.ts';

describe('deploy step', () => {
	describe('resolveMigrationUrl', () => {
		test('GIVEN only the URL of the bot THEN it is used', () => {
			expect(resolveMigrationUrl({ DATABASE_URL: 'postgres://pooled' })).toBe('postgres://pooled');
		});

		test('GIVEN a URL for the migrations THEN it wins, since a pooler does not keep what a migration needs', () => {
			expect(resolveMigrationUrl({ DATABASE_URL: 'postgres://pooled', DATABASE_MIGRATION_URL: 'postgres://direct' })).toBe('postgres://direct');
		});

		test('GIVEN no URL THEN it throws and does not name a value', () => {
			expect(() => resolveMigrationUrl({ DATABASE_MIGRATION_URL: '' })).toThrow('DATABASE_URL');
		});
	});

	describe('resolveSchemaStep', () => {
		test('GIVEN no tables THEN the schema is applied', () => {
			expect(resolveSchemaStep({ hasGuild: false, hasMarker: false })).toBe('apply');
		});

		test('GIVEN a signed database THEN only the migrations run', () => {
			expect(resolveSchemaStep({ hasGuild: true, hasMarker: true })).toBe('migrate');
		});

		test('GIVEN tables nothing signed THEN it stops and tells why', () => {
			expect(() => resolveSchemaStep({ hasGuild: true, hasMarker: false })).toThrow('prisma db sign');
		});
	});

	describe('start script', () => {
		// The shell emulator of pnpm (`shellEmulator` in `pnpm-workspace.yaml`) has no `exec`: the bot would never start.
		test('GIVEN the start script of the bot THEN it runs under the shell of pnpm', async () => {
			const manifest = JSON.parse(await readFile(new URL('../../bot/package.json', import.meta.url), 'utf8')) as { scripts: { start: string } };
			expect(manifest.scripts.start).toContain('migrate:deploy');
			expect(manifest.scripts.start).not.toMatch(/\bexec\b/);
		});
	});

	describe('shouldDeploy', () => {
		test('GIVEN a worker THEN it leaves the schema to the gateway', () => {
			expect(shouldDeploy({ NODE_ENV: 'production', BOT_MODE: 'worker' })).toBe(false);
		});

		test('GIVEN the gateway of an image THEN it applies the schema', () => {
			expect(shouldDeploy({ NODE_ENV: 'production' })).toBe(true);
			expect(shouldDeploy({ NODE_ENV: 'production', BOT_MODE: 'gateway' })).toBe(true);
		});

		test('GIVEN a process out of an image THEN `pnpm start` leaves the schema alone', () => {
			expect(shouldDeploy({})).toBe(false);
			expect(shouldDeploy({ NODE_ENV: 'development' })).toBe(false);
		});
	});
});
