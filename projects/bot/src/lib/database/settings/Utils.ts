import type { ISchemaValue } from '#lib/database/settings/base/ISchemaValue';
import { getConfigurableGroups } from '#lib/database/settings/configuration';
import type { SchemaGroup } from '#lib/database/settings/schema/SchemaGroup';
import type { SchemaKey } from '#lib/database/settings/schema/SchemaKey';
import type { GuildData } from '#lib/database/settings/types';

export function isSchemaGroup(groupOrKey: ISchemaValue): groupOrKey is SchemaGroup {
	return groupOrKey.type === 'Group';
}

export function isSchemaKey(groupOrKey: ISchemaValue): groupOrKey is SchemaKey {
	return groupOrKey.type !== 'Group';
}

export function reset(key: SchemaKey): Partial<GuildData> {
	return { [key.property]: key.default };
}

const ROOT_SCHEMA_KEY = '::ROOT::';

export function getSchemaPath(node: SchemaGroup | SchemaKey): string {
	const segments: string[] = [];
	let current: SchemaGroup | SchemaKey | null = node;

	while (current?.parent) {
		if (current.key !== ROOT_SCHEMA_KEY) segments.unshift(current.key);
		current = current.parent;
	}

	return segments.join('.');
}

export function resolveSchemaPath(path: string): SchemaGroup | SchemaKey {
	if (!path) return getConfigurableGroups();

	return getConfigurableGroups().getPathString(path) ?? getConfigurableGroups();
}
