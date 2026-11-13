import { getConfigurableKeys, type SchemaDataKey } from '#lib/database/settings/configuration';
import { isSchemaKey } from '#lib/database/settings/Utils';
import type { Serializer } from '#lib/database/settings/structures/Serializer';
import type { Translator } from '#lib/structures/commands/utils';
import type { GuildDataValue, ReadonlyGuildData } from 'wolfstar-database';

/**
 * Validates the changes a request writes to the settings of a guild, as the dashboard sends them: `[key, value]` pairs,
 * `null` resetting a key to its default.
 *
 * @remarks Each value is validated on the settings as they end up, the other changes applied: what depends on another
 * key (the pending and the verified roles of the join guard cannot be one role) is checked on the end state, so a write
 * that swaps two values is accepted and one that makes them collide is not.
 *
 * @param settings - The settings of the guild, as they are.
 * @param pairs - The changes, not trusted.
 * @param t - The function to translate the errors with.
 * @returns The changes, with the defaults of the reset keys.
 * @throws The errors, one per change that is not valid, prefixed by its key.
 */
export async function validateSettingsChanges(
	settings: ReadonlyGuildData,
	pairs: readonly (readonly [SchemaDataKey, GuildDataValue])[],
	t: Translator
): Promise<(readonly [SchemaDataKey, GuildDataValue])[]> {
	const keys = getConfigurableKeys();
	const errors: string[] = [];
	const resolved: (readonly [SchemaDataKey, GuildDataValue])[] = [];
	for (const pair of pairs) {
		if (!Array.isArray(pair) || pair.length !== 2) {
			errors.push('Invalid input error.');
			continue;
		}

		const [key, value] = pair;
		const entry = keys.get(key);
		if (!entry || !isSchemaKey(entry)) {
			errors.push(`${key}: The key ${key} does not exist in the current schema.`);
			continue;
		}

		resolved.push([entry.property as SchemaDataKey, value === null ? (entry.default as GuildDataValue) : value]);
	}

	if (errors.length > 0) throw errors;

	const target = { ...settings, ...Object.fromEntries(resolved) } as ReadonlyGuildData;
	const results = await Promise.all(
		pairs.map(async ([key, value]) => {
			// A reset takes the default, which is valid:
			if (value === null) return;

			const entry = keys.get(key)!;
			try {
				const context = await entry.getContext(target, t);
				const valid = await (entry.array ? validateArray(value, context) : entry.serializer.isValid(value as never, context));
				if (!valid) throw 'The value is not valid.';
			} catch (error) {
				errors.push(error instanceof Error ? `${key}: ${error.message}` : `${key}: ${String(error)}`);
			}
		})
	);

	if (errors.length > 0 || results.length !== pairs.length) throw errors;
	return resolved;
}

async function validateArray(value: unknown, context: Serializer.UpdateContext) {
	if (!Array.isArray(value)) throw new Error('Expected an array.');

	const { serializer } = context.entry;
	// Every value has to be valid, an array of results is always truthy:
	const results = await Promise.all(value.map((entry) => serializer.isValid(entry, context)));
	return results.every(Boolean);
}
