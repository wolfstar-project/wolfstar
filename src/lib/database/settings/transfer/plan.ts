import type { GuildData, ReadonlyGuildData } from '#lib/database/settings/types';
import type { ParsedConfiguration } from './parse';
import { isDeepStrictEqual } from 'node:util';

export function planConfigurationImport(settings: ReadonlyGuildData, parsed: ParsedConfiguration) {
	return parsed.settings.flatMap(({ key, value }) => {
		const stored = settings[key.property];
		const before = typeof stored === 'bigint' ? Number(stored) : stored;
		return isDeepStrictEqual(before, value) ? [] : [{ name: key.name, property: key.property, before, after: value }];
	});
}

export function getPlannedSettings(plan: ReturnType<typeof planConfigurationImport>): Partial<GuildData> {
	return Object.fromEntries(plan.map(({ property, after }) => [property, after]));
}
