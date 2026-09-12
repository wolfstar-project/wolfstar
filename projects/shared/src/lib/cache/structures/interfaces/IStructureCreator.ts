import type { NonNullObject } from '@sapphire/utilities';
import type { IStructure, IStructureConstructor } from './IStructure.js';

export interface IStructureCreator<T extends IStructure> extends IStructureConstructor<T> {
	/**
	 * Resolves the entity's ID from raw API data.
	 * @remark Defaults to `BigInt(data.id)` when not implemented, which is correct
	 * for every structure whose identity lives on the top-level `id` field.
	 */
	getId?(data: NonNullObject): bigint;

	/**
	 * Patches an existing instance with partial API data, returning the updated instance.
	 * @remark When not implemented, the caller falls back to a full reconstruction by
	 * merging the existing serialized value with `data`, which generalises patching to
	 * every structure without bespoke logic.
	 */
	patch?(existing: T, data: NonNullObject): T;
}
