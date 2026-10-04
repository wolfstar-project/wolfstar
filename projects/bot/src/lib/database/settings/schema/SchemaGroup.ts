import type { ISchemaValue } from '#lib/database/settings/base/ISchemaValue';
import type { SchemaKey } from '#lib/database/settings/schema/SchemaKey';
import { AliasedCollection } from '#lib/database/settings/structures/collections/AliasedCollection';
import { isNullish, toTitleCase } from '@sapphire/utilities';

export type NonEmptyArray<T> = [T, ...T[]];

export class SchemaGroup extends AliasedCollection<string, SchemaGroup | SchemaKey> implements ISchemaValue {
	public readonly key: string;
	public readonly parent: SchemaGroup | null;
	public readonly name: string;
	public readonly dashboardOnly = false;
	public readonly type = 'Group';

	public constructor(key: string, name = 'Root', parent: SchemaGroup | null = null) {
		super();
		this.key = key;
		this.name = name;
		this.parent = parent;
	}

	public override set(key: string, value: SchemaGroup | SchemaKey) {
		// Add auto-alias:
		if (key.includes('-')) {
			this.aliases.set(key.replaceAll('-', ''), value);
		}

		return super.set(key, value);
	}

	public add([key, ...tail]: NonEmptyArray<string>, value: SchemaKey): SchemaGroup {
		if (tail.length === 0) {
			this.set(key, value);
			return this;
		}

		const previous = this.get(key);
		if (previous) {
			if (previous instanceof SchemaGroup) {
				return previous.add(tail as NonEmptyArray<string>, value);
			}

			throw new Error(`You cannot add '${key}' to a non-group entry.`);
		}

		const group = new SchemaGroup(key, `${this.name} / ${toTitleCase(key)}`, this);
		group.add(tail as NonEmptyArray<string>, value);
		this.set(key, group);
		return group;
	}

	public *childKeys() {
		for (const [key, entry] of this) {
			if (entry.type !== 'Group') yield key;
		}
	}

	public *childValues() {
		for (const entry of this.values()) {
			if (entry.type !== 'Group') yield entry;
		}
	}

	public getPathArray([key, ...tail]: NonEmptyArray<string>): SchemaGroup | SchemaKey | null {
		if (tail.length === 0) {
			return key === '' || key === '.' ? this : (this.get(key) ?? null);
		}

		const value = this.get(key);
		if (isNullish(value)) return null;
		if (value instanceof SchemaGroup) return value.getPathArray(tail as NonEmptyArray<string>);
		return null;
	}

	public getPathString(key: string): SchemaGroup | SchemaKey | null {
		return this.getPathArray(key.split('.') as NonEmptyArray<string>);
	}
}
