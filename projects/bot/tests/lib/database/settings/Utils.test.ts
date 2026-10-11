import { getConfigurableKeys, getSettingName } from '#lib/database';
import { readFileSync } from 'node:fs';

const names = (
	JSON.parse(readFileSync(new URL('../../../../src/locales/en-US/settings.json', import.meta.url), 'utf8')) as { names: Record<string, string> }
).names;

describe('getSettingName', () => {
	test('GIVEN a configurable key THEN translates its name', () => {
		const t = vi.fn((key: string) => `translated ${key}`);

		expect(getSettingName(t as never, 'rolesMuted')).toBe('translated settings:names.rolesMuted');
		expect(t).toHaveBeenCalledWith('settings:names.rolesMuted');
	});

	test('GIVEN something that is not a setting THEN returns it as it was written', () => {
		const t = vi.fn((key: string) => key);

		expect(getSettingName(t as never, 'notASetting')).toBe('notASetting');
		expect(t).not.toHaveBeenCalled();
	});

	test('GIVEN every configurable key THEN en-US has a name for it and for nothing else', () => {
		expect(Object.keys(names).sort()).toEqual([...getConfigurableKeys().keys()].sort());
	});
});
