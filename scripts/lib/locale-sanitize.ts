/**
 * Pure helpers for reconciling a Tolgee export with the locale files in `src/languages`.
 *
 * Shared by `scripts/tolgee-pull-remap.ts` (which applies them) and
 * `tests/languages/locales.test.ts` (which asserts the committed tree satisfies them),
 * so the definition of "a valid locale file" lives in exactly one place.
 *
 * The Tolgee export is not usable as-is:
 *   - arrays come back as `name[0]`, `name[0][1]` string keys;
 *   - untranslated keys come back as `null` or as empty ICU plural skeletons;
 *   - machine translations sometimes translate the i18next placeholders themselves
 *     (`{{value, duration}}` → `{{value, durata}}`), which breaks the formatters;
 *   - keys are alphabetised and indented with two spaces.
 *
 * `mergeNamespace` folds a sanitized export onto the file already on disk: en-US stays the
 * source of truth, untranslated keys keep whatever the repository already had (the empty
 * string, per the Crowdin-era convention), and only real translations move.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

export interface JsonObject {
	[key: string]: JsonValue;
}

/** `name[0]` / `name[0][1]`, as produced by a Tolgee export without `supportArrays`. */
const BRACKET_KEY = /^(.+?)((?:\[\d+\])+)$/;
const BRACKET_INDEX = /\[(\d+)\]/g;

/** i18next plural suffixes; a locale may define categories en-US does not have (e.g. `_many`). */
const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other)$/;

/**
 * `[^}]*` rather than `[^{}]*` on purpose: it makes a malformed `{{{value, duration}}`
 * read as a single (wrong) token instead of silently matching the well-formed tail.
 */
const I18NEXT_PLACEHOLDER = /\{\{[^}]*\}\}/g;

/** Same token, but strict — used to detect braces that belong to no placeholder at all. */
const WELL_FORMED_PLACEHOLDER = /\{\{[^{}]*\}\}/g;

/** Positional placeholders used by the hunger games strings: `{1}`, `{2T}`. */
const POSITIONAL_PLACEHOLDER = /\{\d+[A-Za-z]*\}/g;

const ICU_SELECTOR = /^\{\s*[\w.]+\s*,\s*(?:plural|selectordinal|select)\s*,/;
const ICU_BRANCH = /\{([^{}]*)\}/g;

export function isPlainObject(value: JsonValue | undefined): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * An untranslated Tolgee value: `null`, blank, or a plural skeleton whose branches are all
 * empty (`{count, plural, one {} other {}}`). Such values must never reach a locale file.
 */
export function isUntranslated(value: JsonValue | undefined): boolean {
	if (value === undefined || value === null) return true;
	if (typeof value !== 'string') return false;
	if (value.trim() === '') return true;
	return isEmptyIcuSkeleton(value);
}

export function isEmptyIcuSkeleton(value: string): boolean {
	if (!ICU_SELECTOR.test(value)) return false;
	const branches = [...value.matchAll(ICU_BRANCH)];
	return branches.length > 0 && branches.every((branch) => branch[1].trim() === '');
}

/** i18next and positional placeholders found in a string, as a set (repetitions are irrelevant). */
export function extractPlaceholders(value: string): Set<string> {
	const placeholders = new Set<string>();
	const remainder = value.replace(I18NEXT_PLACEHOLDER, (match) => {
		placeholders.add(match);
		return '';
	});
	for (const match of remainder.matchAll(POSITIONAL_PLACEHOLDER)) placeholders.add(match[0]);
	return placeholders;
}

/**
 * Split `{{value, list(conjunction)}}` into its variable (`value`) and its formatter chain
 * (`list`). Positional tokens such as `{1}` have no formatters and are their own variable.
 */
export function parsePlaceholder(token: string): { variable: string; formatters: string[] } {
	if (!token.startsWith('{{')) return { variable: token, formatters: [] };

	const parts: string[] = [];
	let depth = 0;
	let current = '';
	for (const character of token.slice(2, -2)) {
		if (character === '(') depth++;
		else if (character === ')') depth--;
		if (character === ',' && depth === 0) {
			parts.push(current);
			current = '';
			continue;
		}
		current += character;
	}
	parts.push(current);

	const [variable = '', ...formatters] = parts.map((part) => part.trim());
	return { variable, formatters: formatters.map((formatter) => formatter.split('(')[0]!.trim()).filter((formatter) => formatter !== '') };
}

/** Every formatter name the base locale actually uses — the project's formatter vocabulary. */
export function collectFormatters(value: JsonValue, target = new Set<string>()): Set<string> {
	for (const entry of flattenLocale(value).values()) {
		if (typeof entry !== 'string') continue;
		for (const token of extractPlaceholders(entry)) {
			for (const formatter of parsePlaceholder(token).formatters) target.add(formatter);
		}
	}
	return target;
}

function groupByVariable(value: string): Map<string, Set<string>> {
	const grouped = new Map<string, Set<string>>();
	for (const token of extractPlaceholders(value)) {
		const { variable, formatters } = parsePlaceholder(token);
		const bucket = grouped.get(variable) ?? new Set<string>();
		for (const formatter of formatters) bucket.add(formatter);
		grouped.set(variable, bucket);
	}
	return grouped;
}

/**
 * Whether a translation's placeholders are still usable, given the base string.
 *
 * Machine translation mangles placeholders in two ways, and both must be caught:
 * `{{value, list(conjunction)}}` → `{{valore, elenco(congiunzione)}}` renames the variable,
 * `{{value, duration}}` → `{{value, durata}}` renames the formatter. So the variables have to
 * match exactly, and every formatter has to be one the project actually registers.
 *
 * A translator *adding* a formatter the base omits (`{{count}}` → `{{count, number}}`) is a
 * legitimate improvement and is accepted; dropping or replacing one the base relies on is
 * not, since the value would be rendered raw or with the wrong semantics (`{{value,
 * duration}}` → `{{value, number}}` would print milliseconds as a plain number).
 *
 * @param knownFormatters The formatter vocabulary, normally {@link collectFormatters} over
 * en-US. Omit it to require the placeholders to be byte-identical.
 */
export function placeholdersMatch(base: string, translated: string, knownFormatters?: ReadonlySet<string>): boolean {
	const expected = groupByVariable(base);
	const actual = groupByVariable(translated);
	if (expected.size !== actual.size) return false;

	for (const [variable, baseFormatters] of expected) {
		const translatedFormatters = actual.get(variable);
		if (translatedFormatters === undefined) return false;
		if (knownFormatters === undefined) {
			if (baseFormatters.size !== translatedFormatters.size) return false;
			for (const formatter of baseFormatters) {
				if (!translatedFormatters.has(formatter)) return false;
			}
			continue;
		}
		// A formatter i18next cannot resolve renders the placeholder as literal text.
		for (const formatter of translatedFormatters) {
			if (!knownFormatters.has(formatter)) return false;
		}
		// Every formatter the base relies on has to survive: dropping `duration` would print
		// raw milliseconds, and swapping it for another known formatter (`number`) would
		// render the value with the wrong semantics.
		for (const formatter of baseFormatters) {
			if (!translatedFormatters.has(formatter)) return false;
		}
	}
	return true;
}

/**
 * A brace left over once every well-formed placeholder is removed. Catches the two shapes
 * Tolgee round-trips produce: a typo'd `{{{maximum, duration}}` and the ICU escape it turns
 * into on the way back (`{'{{maximum, duration}}`). Both render as literal garbage.
 */
export function hasStrayBraces(value: string): boolean {
	return /[{}]/.test(value.replace(WELL_FORMED_PLACEHOLDER, '').replace(POSITIONAL_PLACEHOLDER, ''));
}

/** `boolean_many` → `boolean`, so plural categories absent from en-US are not treated as orphans. */
export function pluralStem(key: string): string {
	return key.replace(PLURAL_SUFFIX, '');
}

function buildLevel(entries: { indices: number[]; value: JsonValue }[]): JsonValue[] | undefined {
	const byIndex = new Map<number, { indices: number[]; value: JsonValue }[]>();
	for (const entry of entries) {
		const [head, ...rest] = entry.indices;
		// A key that runs out of indices while a sibling still has them is a shape conflict.
		if (head === undefined) return undefined;
		const bucket = byIndex.get(head);
		if (bucket === undefined) byIndex.set(head, [{ indices: rest, value: entry.value }]);
		else bucket.push({ indices: rest, value: entry.value });
	}

	const result: JsonValue[] = [];
	for (let index = 0; index < byIndex.size; index++) {
		const bucket = byIndex.get(index);
		// Indices must cover 0..n-1: a hole would silently shift every later element.
		if (bucket === undefined) return undefined;
		const [first] = bucket;
		if (bucket.length === 1 && first !== undefined && first.indices.length === 0) {
			result.push(first.value);
			continue;
		}
		const nested = buildLevel(bucket);
		if (nested === undefined) return undefined;
		result.push(nested);
	}
	return result;
}

/**
 * Rebuild `name[0]` style keys into real arrays, ordered by numeric index rather than by the
 * lexicographic order Tolgee exports them in (`[0]`, `[1]`, `[10]`, `[100]`, `[11]`, …).
 *
 * Kept even though `pull.supportArrays` is enabled in `.tolgeerc.cjs`: it is the guard that
 * turns a silent regression on the Tolgee side into a reported, skipped key.
 */
export function unflattenArrays(value: JsonValue, onDrop?: (path: string, reason: string) => void, path = ''): JsonValue {
	if (Array.isArray(value)) return value.map((entry, index) => unflattenArrays(entry, onDrop, `${path}[${index}]`));
	if (!isPlainObject(value)) return value;

	const result: JsonObject = {};
	const groups = new Map<string, Map<string, JsonValue>>();
	const reserved = new Set<string>();

	for (const [key, entry] of Object.entries(value)) {
		const childPath = path ? `${path}.${key}` : key;
		const child = unflattenArrays(entry, onDrop, childPath);
		const match = BRACKET_KEY.exec(key);
		if (match === null) {
			result[key] = child;
			continue;
		}

		const base = match[1]!;
		const indices = match[2]!;
		if (base in result && !reserved.has(base)) {
			// A literal key already occupies the name; keep the bracket key verbatim so the
			// validation step reports it instead of us dropping data here.
			result[key] = child;
			continue;
		}

		let group = groups.get(base);
		if (group === undefined) {
			group = new Map();
			groups.set(base, group);
			reserved.add(base);
			result[base] = null; // reserve the position so the original key order survives
		}
		group.set(indices, child);
	}

	for (const [base, group] of groups) {
		const entries = [...group].map(([indices, entry]) => ({
			indices: [...indices.matchAll(BRACKET_INDEX)].map((match) => Number(match[1])),
			value: entry
		}));
		const built = buildLevel(entries);
		if (built === undefined) {
			delete result[base];
			onDrop?.(path ? `${path}.${base}` : base, 'non-contiguous or conflicting array indices');
			continue;
		}
		result[base] = built;
	}

	return result;
}

export interface NamespaceReport {
	/** Paths whose value actually changed. */
	readonly updated: string[];
	/** Translations rejected because their placeholders do not match en-US. */
	readonly skipped: { path: string; base: string; translated: string }[];
	/** Empty keys removed because en-US no longer defines them. */
	readonly pruned: string[];
	/** Keys en-US no longer defines that still hold a translation: kept, and reported. */
	readonly orphaned: string[];
	/** Arrays that could not be rebuilt from `name[0]` keys. */
	readonly malformed: { path: string; reason: string }[];
}

export function createReport(): NamespaceReport {
	return { updated: [], skipped: [], pruned: [], orphaned: [], malformed: [] };
}

export function isReportEmpty(report: NamespaceReport): boolean {
	return (
		report.updated.length === 0 &&
		report.skipped.length === 0 &&
		report.pruned.length === 0 &&
		report.orphaned.length === 0 &&
		report.malformed.length === 0
	);
}

export interface MergeContext {
	readonly report: NamespaceReport;
	/** Formatter vocabulary, from {@link collectFormatters} over en-US. */
	readonly knownFormatters: ReadonlySet<string>;
}

function hasBaseKey(base: JsonObject, key: string): boolean {
	if (key in base) return true;
	const stem = pluralStem(key);
	if (stem === key) return false;
	return Object.keys(base).some((candidate) => pluralStem(candidate) === stem);
}

/** Whether a subtree holds at least one non-empty string, i.e. actual translation work. */
export function hasTranslation(value: JsonValue | undefined): boolean {
	if (value === undefined) return false;
	for (const entry of flattenLocale(value).values()) {
		if (typeof entry === 'string' && entry.trim() !== '') return true;
	}
	return false;
}

function mergeScalar(local: JsonValue | undefined, pulled: JsonValue | undefined, base: JsonValue | undefined, path: string, context: MergeContext) {
	// Nothing usable came back: whatever the repository already had wins.
	if (typeof pulled !== 'string' || isUntranslated(pulled)) return local;
	if (hasStrayBraces(pulled)) {
		context.report.skipped.push({ path, base: typeof base === 'string' ? base : '', translated: pulled });
		return local;
	}
	if (typeof base === 'string' && base.trim() !== '' && !placeholdersMatch(base, pulled, context.knownFormatters)) {
		context.report.skipped.push({ path, base, translated: pulled });
		return local;
	}
	if (local === pulled) return local;
	context.report.updated.push(path);
	return pulled;
}

function mergeArray(local: JsonValue | undefined, pulled: JsonValue | undefined, base: JsonValue | undefined, path: string, context: MergeContext) {
	const localArray = Array.isArray(local) ? local : [];
	const pulledArray = Array.isArray(pulled) ? pulled : [];
	const baseArray = Array.isArray(base) ? base : undefined;
	// en-US fixes the length: entries are addressed positionally, so the array has to stay
	// dense and aligned with the base language, padded with empty strings where needed.
	const length = baseArray?.length ?? Math.max(localArray.length, pulledArray.length);

	const result: JsonValue[] = [];
	for (let index = 0; index < length; index++) {
		const merged = mergeValue(localArray[index], pulledArray[index], baseArray?.[index], `${path}[${index}]`, context);
		result.push(merged ?? '');
	}
	return result;
}

function mergeObject(local: JsonValue | undefined, pulled: JsonValue | undefined, base: JsonValue | undefined, path: string, context: MergeContext) {
	const localObject = isPlainObject(local) ? local : {};
	const pulledObject = isPlainObject(pulled) ? pulled : {};
	const baseObject = isPlainObject(base) ? base : undefined;
	const result: JsonObject = {};

	// Local key order first — that is what keeps the diff limited to real translation changes.
	const keys = [...Object.keys(localObject), ...Object.keys(pulledObject).filter((key) => !(key in localObject))];
	for (const key of keys) {
		const childPath = path ? `${path}.${key}` : key;
		if (baseObject !== undefined && !hasBaseKey(baseObject, key)) {
			// en-US no longer defines this key. Dropping it is right for the empty placeholders
			// left behind by a rename, but keys that moved namespace (commands/admin →
			// commands/conf) still carry real translations: keep those and report them so the
			// work can be relocated by hand instead of being silently deleted.
			if (hasTranslation(localObject[key])) {
				context.report.orphaned.push(childPath);
				result[key] = localObject[key]!;
				continue;
			}
			context.report.pruned.push(childPath);
			continue;
		}
		const merged = mergeValue(localObject[key], pulledObject[key], baseObject?.[key], childPath, context);
		if (merged !== undefined) result[key] = merged;
	}

	return result;
}

function mergeValue(
	local: JsonValue | undefined,
	pulled: JsonValue | undefined,
	base: JsonValue | undefined,
	path: string,
	context: MergeContext
): JsonValue | undefined {
	if (isPlainObject(pulled) || isPlainObject(local)) return mergeObject(local, pulled, base, path, context);
	if (Array.isArray(pulled) || Array.isArray(local) || Array.isArray(base)) return mergeArray(local, pulled, base, path, context);
	return mergeScalar(local, pulled, base, path, context);
}

/**
 * Fold a Tolgee export onto the namespace already committed in `src/languages`.
 *
 * @param local Parsed contents of the file on disk (`[]` for a namespace with no translations).
 * @param pulled Parsed contents of the staged export, after {@link unflattenArrays}.
 * @param base The matching en-US namespace, or `undefined` when en-US does not define it — in
 * which case neither placeholder validation nor orphan pruning can run.
 */
export function mergeNamespace(local: JsonValue, pulled: JsonValue, base: JsonValue | undefined, context: MergeContext): JsonObject {
	return mergeObject(local, pulled, base, '', context);
}

/** Serialize with the repository's style for locale files: tabs and a trailing newline. */
export function serializeLocale(value: JsonValue): string {
	return `${JSON.stringify(value, null, '\t')}\n`;
}

/** Flatten a namespace to `path` → scalar, encoding array entries as `path[0]`. */
export function flattenLocale(value: JsonValue, prefix = '', target = new Map<string, JsonValue>()): Map<string, JsonValue> {
	if (Array.isArray(value)) {
		value.forEach((entry, index) => flattenLocale(entry, `${prefix}[${index}]`, target));
		return target;
	}
	if (isPlainObject(value)) {
		for (const [key, entry] of Object.entries(value)) flattenLocale(entry, prefix ? `${prefix}.${key}` : key, target);
		return target;
	}
	target.set(prefix, value);
	return target;
}

/** Keys still carrying the `name[0]` export syntax, i.e. arrays that were never rebuilt. */
export function findBracketKeys(value: JsonValue, prefix = '', target: string[] = []): string[] {
	if (Array.isArray(value)) {
		value.forEach((entry, index) => findBracketKeys(entry, `${prefix}[${index}]`, target));
		return target;
	}
	if (!isPlainObject(value)) return target;
	for (const [key, entry] of Object.entries(value)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (BRACKET_KEY.test(key)) target.push(path);
		findBracketKeys(entry, path, target);
	}
	return target;
}
