import { getConfigurableGroups } from '#lib/database/settings';
import { getSchemaPath, resolveSchemaPath } from '#lib/database/settings/Utils';

describe('schema path helpers', () => {
	it('resolves a top-level key path', () => {
		const root = getConfigurableGroups();
		const prefix = root.get('prefix');

		expect(prefix).toBeDefined();
		expect(getSchemaPath(prefix!)).toBe('prefix');
		expect(resolveSchemaPath('prefix')).toBe(prefix);
	});

	it('returns the root group for an empty path', () => {
		const root = getConfigurableGroups();

		expect(getSchemaPath(root)).toBe('');
		expect(resolveSchemaPath('')).toBe(root);
	});

	it('falls back to root for unknown paths', () => {
		const root = getConfigurableGroups();

		expect(resolveSchemaPath('this.path.does.not.exist')).toBe(root);
	});
});
