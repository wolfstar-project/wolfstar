import { getConfigurableKeys, getSettingName } from '#lib/database';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { getDefaultGuildSettings } from 'wolfstar-database';

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

describe('the defaults of the settings', () => {
	test('GIVEN every configurable key THEN a reset gives it the value a new server starts with', () => {
		const defaults = getDefaultGuildSettings() as unknown as Record<string, unknown>;
		const differing = [...getConfigurableKeys().values()]
			.filter((key) => key.property in defaults && !isDeepStrictEqual(key.default, defaults[key.property]))
			.map((key) => `${key.name}: ${JSON.stringify(key.default)} instead of ${JSON.stringify(defaults[key.property])}`);

		expect(differing).toEqual([]);
	});
});
