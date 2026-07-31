/**
 * Tolgee CLI config for WolfStar bot (project id 33768).
 *
 * Local layout: src/languages/{discordLocale}/{namespace}.json
 * Tolgee tags are shorter (en-US → en, es-ES → es, zh-CN → zh-Hans, …).
 *
 * Push uses an explicit files list so local folder names ≠ Tolgee tags.
 * Pull stages into `.tolgee-pull/`; `pnpm tolgee:pull` remaps via
 * scripts/tolgee-pull-remap.ts using `tolgeeToLocal` below.
 *
 * Nested namespaces (commands/admin, events/errors) are discovered from en-US.
 * Default script pushes base English only (`pnpm tolgee:push` → `--languages en`).
 *
 * Set TOLGEE_API_KEY (Project API Key or PAT) in the environment — never commit it.
 */
const { existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

/** Local directory under src/languages/ → Tolgee language tag. */
const LOCALE_MAP = {
	'en-US': 'en',
	'en-GB': 'en-GB',
	'es-ES': 'es',
	'es-419': 'es-419',
	bg: 'bg',
	cs: 'cs',
	da: 'da',
	de: 'de',
	el: 'el',
	fi: 'fi',
	fr: 'fr',
	hi: 'hi',
	hr: 'hr',
	hu: 'hu',
	id: 'id',
	it: 'it',
	ja: 'ja',
	ko: 'ko',
	lt: 'lt',
	nl: 'nl',
	no: 'no',
	pl: 'pl',
	'pt-BR': 'pt',
	ro: 'ro',
	ru: 'ru',
	'sv-SE': 'sv',
	th: 'th',
	tr: 'tr',
	uk: 'uk',
	vi: 'vi',
	'zh-CN': 'zh-Hans',
	'zh-TW': 'zh-Hant'
};

/** Tolgee language tag → local directory (for pull remapping). */
const TOLGEE_TO_LOCAL = Object.fromEntries(Object.entries(LOCALE_MAP).map(([local, tag]) => [tag, local]));

/** Collect namespace-relative paths (e.g. globals, commands/admin). */
function collectNamespaces(dir, relative = '') {
	const entries = readdirSync(dir, { withFileTypes: true });
	const namespaces = [];
	for (const entry of entries) {
		const rel = relative ? `${relative}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			namespaces.push(...collectNamespaces(join(dir, entry.name), rel));
		} else if (entry.isFile() && entry.name.endsWith('.json')) {
			namespaces.push(rel.replace(/\.json$/, ''));
		}
	}
	return namespaces;
}

const languagesRoot = join(__dirname, 'src/languages');
const baseLocaleDir = join(languagesRoot, 'en-US');
if (!existsSync(baseLocaleDir)) {
	throw new Error(`Missing base locale directory: ${baseLocaleDir}`);
}

const NAMESPACES = collectNamespaces(baseLocaleDir).sort();

// Explicit path → Tolgee language/namespace so Discord dirs (en-US) push as
// short tags (en). Skip missing files — non-English locales omit a few namespaces.
const pushFiles = Object.entries(LOCALE_MAP).flatMap(([localDir, language]) =>
	NAMESPACES.flatMap((namespace) => {
		const path = `./src/languages/${localDir}/${namespace}.json`;
		if (!existsSync(join(languagesRoot, localDir, `${namespace}.json`))) return [];
		return [{ path, language, namespace }];
	})
);

module.exports = {
	$schema: 'https://raw.githubusercontent.com/tolgee/tolgee-cli/main/schema.json',
	projectId: 33602,
	format: 'JSON_I18NEXT',
	push: {
		forceMode: 'KEEP',
		files: pushFiles
	},
	pull: {
		path: '.tolgee-pull',
		fileStructureTemplate: '{languageTag}/{namespace}.json'
	},
	// Exported for scripts/tolgee-pull-remap.ts (single source of truth with push)
	tolgeeToLocal: TOLGEE_TO_LOCAL,
	localeMap: LOCALE_MAP,
	namespaces: NAMESPACES
};
