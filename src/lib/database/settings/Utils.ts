import type { ISchemaValue } from '#lib/database/settings/base/ISchemaValue';
import type { SchemaGroup } from '#lib/database/settings/schema/SchemaGroup';
import type { SchemaKey } from '#lib/database/settings/schema/SchemaKey';
import type { GuildData, ReadonlyGuildData } from '#lib/database/settings/types';
import { LanguageKeys } from '#lib/i18n/languageKeys';
import type { WolfArgs } from '#lib/structures';
import { UserError } from '@sapphire/framework';

export function isSchemaGroup(groupOrKey: ISchemaValue): groupOrKey is SchemaGroup {
	return groupOrKey.type === 'Group';
}

export function isSchemaKey(groupOrKey: ISchemaValue): groupOrKey is SchemaKey {
	return groupOrKey.type !== 'Group';
}

<<<<<<< HEAD
export async function set(settings: ReadonlyGuildEntity, key: SchemaKey, args: WolfArgs): Promise<Partial<GuildData>> {
=======
export async function set(settings: ReadonlyGuildData, key: SchemaKey, args: SkyraArgs): Promise<Partial<GuildData>> {
>>>>>>> 76a7c1e7 (refactor: switch to prisma)
	const parsed = await key.parse(settings, args);
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
			identifier: LanguageKeys.Settings.Gateway.DuplicateValue,
			context: {
				path: key.name,
				value: key.stringify(settings, args.t, parsed)
			}
		});
	}

	return { [key.property]: parsed };
}

<<<<<<< HEAD
export async function remove(settings: ReadonlyGuildEntity, key: SchemaKey, args: WolfArgs): Promise<Partial<GuildData>> {
=======
export async function remove(settings: ReadonlyGuildData, key: SchemaKey, args: SkyraArgs): Promise<Partial<GuildData>> {
>>>>>>> 76a7c1e7 (refactor: switch to prisma)
	const parsed = await key.parse(settings, args);
	if (key.array) {
		const { serializer } = key;
		const values = settings[key.property] as any[];

		const index = values.findIndex((value) => serializer.equals(value, parsed));
		if (index === -1) {
			throw new UserError({
				identifier: LanguageKeys.Settings.Gateway.MissingValue,
				context: { path: key.name, value: key.stringify(settings, args.t, parsed) }
			});
		}

		return { [key.property]: values.toSpliced(index, 1) };
	}

	return { [key.property]: key.default };
}

export function reset(key: SchemaKey): Partial<GuildData> {
	return { [key.property]: key.default };
}
