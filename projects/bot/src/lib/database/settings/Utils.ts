import type { ISchemaValue } from '#lib/database/settings/base/ISchemaValue';
import { getConfigurableGroups } from '#lib/database/settings/configuration';
import type { SchemaGroup } from '#lib/database/settings/schema/SchemaGroup';
import type { SchemaKey } from '#lib/database/settings/schema/SchemaKey';
import type { GuildData, ReadonlyGuildData } from '#lib/database/settings/types';
import type { Translator } from '#lib/structures/commands/utils';
import { UserError } from '@wolfstar/http-framework';

export function isSchemaGroup(groupOrKey: ISchemaValue): groupOrKey is SchemaGroup {
	return groupOrKey.type === 'Group';
}

export function isSchemaKey(groupOrKey: ISchemaValue): groupOrKey is SchemaKey {
	return groupOrKey.type !== 'Group';
}

/**
 * Parses the text a user wrote and resolves the change that sets it: the value itself, or the list with the value added
 * (or replaced, when the list already holds an equal one) for the keys that hold a list.
 *
 * @throws A `UserError` (`settings:validationDuplicatedValue`) when the key already holds the value.
 */
export async function set(settings: ReadonlyGuildData, key: SchemaKey, input: string, t: Translator): Promise<Partial<GuildData>> {
	const parsed = await key.parse(settings, t, input);
	const { serializer } = key;

	if (key.array) {
		const values = settings[key.property] as any[];
		const index = values.findIndex((value) => serializer.equals(value, parsed));

		return index === -1 //
			? { [key.property]: values.concat(parsed) }
			: { [key.property]: values.with(index, parsed) };
	}

	if (serializer.equals(settings[key.property], parsed)) {
		throw new UserError({
			identifier: 'settings:validationDuplicatedValue',
			context: {
				path: key.name,
				value: await key.stringify(settings, t, parsed)
			}
		});
	}

	return { [key.property]: parsed };
}

/**
 * Parses the text a user wrote and resolves the change that removes it: the list without the value for the keys that hold
 * a list, the default of the key otherwise.
 *
 * @throws A `UserError` (`settings:validationMissingValue`) when the list does not hold the value.
 */
export async function remove(settings: ReadonlyGuildData, key: SchemaKey, input: string, t: Translator): Promise<Partial<GuildData>> {
	const parsed = await key.parse(settings, t, input);
	if (key.array) {
		const { serializer } = key;
		const values = settings[key.property] as any[];

		const index = values.findIndex((value) => serializer.equals(value, parsed));
		if (index === -1) {
			throw new UserError({
				identifier: 'settings:validationMissingValue',
				context: { path: key.name, value: await key.stringify(settings, t, parsed) }
			});
		}

		return { [key.property]: values.toSpliced(index, 1) };
	}

	return { [key.property]: key.default };
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
