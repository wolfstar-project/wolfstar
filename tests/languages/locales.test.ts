import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	collectFormatters,
	extractPlaceholders,
	findBracketKeys,
	flattenLocale,
	hasStrayBraces,
	hasTranslation,
	isEmptyIcuSkeleton,
	isPlainObject,
	placeholdersMatch,
	pluralStem,
	type JsonValue
} from '../../scripts/lib/locale-sanitize.ts';

/**
 * Structural guard for `src/languages`.
 *
 * The nightly Tolgee sync opens a pull request against main, so these assertions run on the
 * sync's own diff: a regression in `scripts/tolgee-pull-remap.ts` — or a corrupt export —
 * fails CI instead of landing broken locale files.
 */

const languagesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'languages');
const BASE_LOCALE = 'en-US';

function collectNamespaces(dir: string, relative = ''): string[] {
	const namespaces: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const rel = relative ? `${relative}/${entry.name}` : entry.name;
		if (entry.isDirectory()) namespaces.push(...collectNamespaces(join(dir, entry.name), rel));
		else if (entry.isFile() && entry.name.endsWith('.json')) namespaces.push(rel);
	}
	return namespaces;
}

function readNamespace(locale: string, namespace: string): JsonValue {
	return JSON.parse(readFileSync(join(languagesRoot, locale, namespace), 'utf8')) as JsonValue;
}

const locales = readdirSync(languagesRoot, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();

const baseNamespaces = new Set(collectNamespaces(join(languagesRoot, BASE_LOCALE)));
const baseValues = new Map<string, Map<string, JsonValue>>();
const knownFormatters = new Set<string>();
for (const namespace of baseNamespaces) {
	const contents = readNamespace(BASE_LOCALE, namespace);
	baseValues.set(namespace, flattenLocale(contents));
	collectFormatters(contents, knownFormatters);
}

describe('locale files', () => {
	test('the base locale is present', () => {
		expect(locales).toContain(BASE_LOCALE);
		expect(baseNamespaces.size).toBeGreaterThan(0);
	});

	test.each(locales)('%s is structurally valid', (locale) => {
		const nulls: string[] = [];
		const bracketKeys: string[] = [];
		const skeletons: string[] = [];
		const strayBraces: string[] = [];

		for (const namespace of collectNamespaces(join(languagesRoot, locale))) {
			const contents = readNamespace(locale, namespace);
			for (const path of findBracketKeys(contents)) bracketKeys.push(`${namespace}:${path}`);
			for (const [path, value] of flattenLocale(contents)) {
				if (value === null) nulls.push(`${namespace}:${path}`);
				else if (typeof value !== 'string' || value === '') continue;
				else if (isEmptyIcuSkeleton(value)) skeletons.push(`${namespace}:${path}`);
				else if (hasStrayBraces(value)) strayBraces.push(`${namespace}:${path}`);
			}
		}

		// `null` is how Tolgee exports an untranslated key; the repository uses `""`.
		expect(nulls).toStrictEqual([]);
		// `name[0]` keys mean an array was never rebuilt — the bot reads these as arrays.
		expect(bracketKeys).toStrictEqual([]);
		// Raw ICU plural shells must never leak into i18next files.
		expect(skeletons).toStrictEqual([]);
		// A brace outside a placeholder renders literally: `{{{maximum, duration}}`, `{'{…`.
		expect(strayBraces).toStrictEqual([]);
	});

	test.each(locales.filter((locale) => locale !== BASE_LOCALE))('%s matches the shape of the base locale', (locale) => {
		const placeholderMismatches: string[] = [];
		const shapeMismatches: string[] = [];

		for (const namespace of collectNamespaces(join(languagesRoot, locale))) {
			// Namespaces en-US does not define (legacy leftovers such as commands/twitch.json)
			// have no reference to validate against.
			const base = baseValues.get(namespace);
			if (base === undefined) continue;

			const contents = readNamespace(locale, namespace);
			const baseContents = readNamespace(BASE_LOCALE, namespace);
			if (isPlainObject(contents) && isPlainObject(baseContents)) {
				for (const [key, value] of Object.entries(contents)) {
					const baseValue = baseContents[key];
					if (baseValue === undefined) continue;
					if (Array.isArray(baseValue) !== Array.isArray(value)) shapeMismatches.push(`${namespace}:${key}`);
				}
			}

			for (const [path, value] of flattenLocale(contents)) {
				if (typeof value !== 'string' || value === '') continue;
				const baseValue = base.get(path);
				if (typeof baseValue !== 'string' || baseValue === '') continue;
				if (!placeholdersMatch(baseValue, value, knownFormatters)) {
					placeholderMismatches.push(`${namespace}:${path} expected ${[...extractPlaceholders(baseValue)].join(' ')}`);
				}
			}
		}

		// A translated placeholder (`{{value, duration}}` → `{{value, durata}}`) silently
		// breaks the i18next formatter at runtime.
		expect(placeholderMismatches).toStrictEqual([]);
		// Arrays are addressed positionally, so they must stay arrays in every locale.
		expect(shapeMismatches).toStrictEqual([]);
	});
});

describe('locale sanitizing helpers', () => {
	test('GIVEN empty ICU plural shells THEN recognises them as untranslated', () => {
		expect(isEmptyIcuSkeleton('{count, plural,\none {}\nother {}\n}')).toBe(true);
		expect(isEmptyIcuSkeleton('{count, plural, one {1 apple} other {# apples}}')).toBe(false);
		expect(isEmptyIcuSkeleton('Just a sentence.')).toBe(false);
	});

	test('GIVEN a translated formatter THEN reports a placeholder mismatch', () => {
		expect(placeholdersMatch('{{value, duration}}', '{{value, durata}}', knownFormatters)).toBe(false);
		expect(placeholdersMatch('{{value, list(conjunction)}}', '{{valore, elenco(congiunzione)}}', knownFormatters)).toBe(false);
		expect(placeholdersMatch('{{value, duration}}', 'Durata: {{value, duration}}', knownFormatters)).toBe(true);
		expect(placeholdersMatch('{1} goes hunting.', '{1} va a caccia.', knownFormatters)).toBe(true);
		expect(placeholdersMatch('{1} goes hunting.', '{2} va a caccia.', knownFormatters)).toBe(false);
	});

	test('GIVEN an added formatter THEN accepts it, GIVEN a dropped one THEN rejects it', () => {
		// A translator refining `{{count}}` into `{{count, number}}` is an improvement…
		expect(placeholdersMatch('{{count}} warnings', '{{count, number}} advertencias', knownFormatters)).toBe(true);
		// …but losing the formatter the base relies on would print the raw value…
		expect(placeholdersMatch('{{value, duration}}', '{{value}}', knownFormatters)).toBe(false);
		// …and swapping it for another known formatter would render the wrong semantics.
		expect(placeholdersMatch('{{value, duration}}', '{{value, number}}', knownFormatters)).toBe(false);
	});

	test('GIVEN the base locale THEN its formatter vocabulary is non-empty', () => {
		expect(knownFormatters.has('duration')).toBe(true);
		expect(knownFormatters.has('number')).toBe(true);
		expect(knownFormatters.has('durata')).toBe(false);
	});

	test('GIVEN a malformed brace THEN reports a placeholder mismatch', () => {
		expect(placeholdersMatch('{{maximum, duration}}', '{{{maximum, duration}}')).toBe(false);
	});

	test('GIVEN braces outside a placeholder THEN flags them', () => {
		expect(hasStrayBraces('longer than {{maximum, duration}}, which is not allowed!')).toBe(false);
		expect(hasStrayBraces('{1} goes hunting with {2T}.')).toBe(false);
		// The typo, and the ICU escape a Tolgee round-trip turns it into.
		expect(hasStrayBraces('longer than {{{maximum, duration}}')).toBe(true);
		expect(hasStrayBraces("longer than {'{{maximum, duration}}")).toBe(true);
	});

	test('GIVEN a subtree of empty placeholders THEN reports no translation', () => {
		expect(hasTranslation({ a: '', b: ['', ''] })).toBe(false);
		expect(hasTranslation({ a: '', b: ['', 'Ciao'] })).toBe(true);
		expect(hasTranslation(undefined)).toBe(false);
	});

	test('GIVEN a plural category absent from the base locale THEN shares its stem', () => {
		expect(pluralStem('boolean_many')).toBe('boolean');
		expect(pluralStem('boolean_other')).toBe('boolean');
		expect(pluralStem('booleanError')).toBe('booleanError');
	});
});
