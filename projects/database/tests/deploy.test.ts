import { resolveMigrationUrl, shouldDeploy } from '../scripts/deploy.ts';

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

	describe('shouldDeploy', () => {
		test('GIVEN a worker THEN it leaves the schema to the gateway', () => {
			expect(shouldDeploy({ BOT_MODE: 'worker' })).toBe(false);
		});

		test('GIVEN the gateway THEN it applies the schema', () => {
			expect(shouldDeploy({})).toBe(true);
			expect(shouldDeploy({ BOT_MODE: 'gateway' })).toBe(true);
		});
	});
});
