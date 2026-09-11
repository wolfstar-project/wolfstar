/**
 * Fold a Tolgee export into the WolfStar language directories.
 *
 * Reads .tolgee-pull/{tag}/{namespace}.json → src/languages/{locale}/{namespace}.json
 *
 * Tolgee tags (es, pt, zh-Hans, …) are remapped to Discord locale folder names
 * (es-ES, pt-BR, zh-CN, …) using `tolgeeToLocal` from `.tolgeerc.cjs`. Nested namespaces
 * (commands/admin, events/errors) are preserved. Non-JSON files such as constants.ts are
 * never touched.
 *
 * This is a *merge*, not an overwrite. For every namespace the file already committed in
 * src/languages is the starting point and only genuine translations are applied on top:
 *
 *   - src/languages/en-US is never written — it is the local source of truth, pushed to
 *     Tolgee and never pulled back;
 *   - `null`, blank and empty ICU plural skeletons are dropped, so a key with no translation
 *     keeps the empty-string placeholder the repository already had (and a namespace with no
 *     translations at all stays byte-identical, including the empty `[]` files);
 *   - translations whose i18next placeholders do not match en-US are rejected and reported —
 *     machine translation occasionally translates the formatter itself
 *     (`{{value, duration}}` → `{{value, durata}}`), which breaks rendering;
 *   - keys en-US no longer defines are pruned (plural categories such as `_many` that only
 *     exist outside en-US are kept);
 *   - files are rewritten in the repository style (tabs, trailing newline) preserving the
 *     existing key order, so the diff only ever shows real translation changes.
 *
 * Usage:  pnpm tolgee:pull
 *         (or: pnpm exec tolgee pull && node --experimental-strip-types scripts/tolgee-pull-remap.ts)
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, type Dirent } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	collectFormatters,
	createReport,
	flattenLocale,
	isReportEmpty,
	mergeNamespace,
	serializeLocale,
	unflattenArrays,
	type JsonValue,
	type NamespaceReport
} from './lib/locale-sanitize.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const config = require('../.tolgeerc.cjs') as {
	pull: { path: string };
	tolgeeToLocal: Record<string, string>;
	namespaces?: string[];
};

/**
 * Tolgee language tags → local dirs under src/languages/.
 * Single source of truth: `.tolgeerc.cjs` (shared with push).
 */
const TOLGEE_TO_LOCAL: Record<string, string> = config.tolgeeToLocal;

/** Base locale: pushed to Tolgee, never written back from a pull. */
const BASE_LOCALE = 'en-US';

const pullRoot = join(root, config.pull.path.replace(/^\.\//, ''));
const languagesRoot = join(root, 'src/languages');
const reportPath = join(root, '.tolgee-report.md');

function resolveLocalDir(tag: string): string | undefined {
	return TOLGEE_TO_LOCAL[tag] ?? (existsSync(join(languagesRoot, tag)) ? tag : undefined);
}

/** Collect namespace-relative paths (e.g. globals.json, commands/admin.json). */
function collectJsonFiles(dir: string, relative = ''): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const rel = relative ? `${relative}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			files.push(...collectJsonFiles(join(dir, entry.name), rel));
		} else if (entry.isFile() && entry.name.endsWith('.json')) {
			files.push(rel);
		}
	}
	return files;
}

function isLanguageDir(entry: Dirent): boolean {
	return entry.isDirectory() && !entry.name.startsWith('.');
}

function readJson(path: string): JsonValue {
	return JSON.parse(readFileSync(path, 'utf8')) as JsonValue;
}

if (!existsSync(pullRoot)) {
	console.error(`Missing pull directory: ${pullRoot}`);
	console.error('Run `pnpm exec tolgee pull` first.');
	process.exit(1);
}

const pullTags = readdirSync(pullRoot, { withFileTypes: true })
	.filter(isLanguageDir)
	.map((entry) => entry.name);

for (const tag of pullTags) {
	if (!resolveLocalDir(tag)) console.warn(`Skipping unmapped Tolgee language tag: ${tag}`);
}

// Pulls may legitimately contain a subset of the configured languages
// (e.g. `tolgee pull --languages en-US es it`), so remap only the mapped
// language directories actually present in staging. Absent configured
// languages are reported but do not fail the pull.
const mappedTags = pullTags.filter((tag) => Boolean(resolveLocalDir(tag)));
if (mappedTags.length === 0) {
	console.error(`No mapped Tolgee language directories found in ${pullRoot}`);
	process.exit(1);
}
const absentTags = Object.keys(TOLGEE_TO_LOCAL).filter((tag) => !mappedTags.includes(tag));
if (absentTags.length > 0) {
	console.warn(`Configured languages absent from this pull (left untouched): ${absentTags.join(', ')}`);
}

/** en-US namespaces, lazily parsed: the reference for placeholders and for orphan pruning. */
const baseCache = new Map<string, JsonValue | undefined>();
function readBaseNamespace(namespace: string): JsonValue | undefined {
	if (!baseCache.has(namespace)) {
		const path = join(languagesRoot, BASE_LOCALE, namespace);
		baseCache.set(namespace, existsSync(path) ? readJson(path) : undefined);
	}
	return baseCache.get(namespace);
}

// Every formatter en-US uses. A translation may add one of these to a placeholder, but a
// formatter outside this set does not exist and would render as literal text.
const knownFormatters = new Set<string>();
for (const namespace of collectJsonFiles(join(languagesRoot, BASE_LOCALE))) {
	collectFormatters(readJson(join(languagesRoot, BASE_LOCALE, namespace)), knownFormatters);
}

// Build and validate the full replacement tree in memory before touching src/languages/,
// so an unreadable or invalid staging file cannot leave the live locale tree partially
// updated. Namespaces that merge down to no change at all are not queued for writing.
const writes: { dest: string; content: Buffer }[] = [];
const reports = new Map<string, NamespaceReport>();
let scanned = 0;

const translatableTags = mappedTags.filter((tag) => resolveLocalDir(tag) !== BASE_LOCALE);
if (translatableTags.length < mappedTags.length) {
	console.log(`Skipping ${BASE_LOCALE}: it is the local source of truth and is never written by a pull.`);
}
if (translatableTags.length === 0) {
	rmSync(pullRoot, { recursive: true, force: true });
	console.log(`Nothing to remap: this pull only contains ${BASE_LOCALE}.`);
	process.exit(0);
}

for (const tag of translatableTags) {
	const localDir = resolveLocalDir(tag);
	if (!localDir) continue;

	const namespaces = collectJsonFiles(join(pullRoot, tag));
	if (namespaces.length === 0) {
		console.warn(`Skipping empty Tolgee language directory: ${tag}`);
		continue;
	}

	for (const namespace of namespaces) {
		scanned++;
		let pulled: JsonValue;
		try {
			pulled = readJson(join(pullRoot, tag, namespace));
		} catch (error) {
			console.error(`Invalid or unreadable staging file: ${tag}/${namespace}`);
			console.error(String(error));
			console.error(`Staging directory preserved for inspection: ${pullRoot}`);
			process.exit(1);
		}

		const dest = join(languagesRoot, localDir, namespace);
		let local: JsonValue = {};
		if (existsSync(dest)) {
			try {
				local = readJson(dest);
			} catch (error) {
				console.error(`Invalid or unreadable locale file: ${localDir}/${namespace}`);
				console.error(String(error));
				process.exit(1);
			}
		}

		const report = createReport();
		const sanitized = unflattenArrays(pulled, (path, reason) => report.malformed.push({ path, reason }));
		const merged = mergeNamespace(local, sanitized, readBaseNamespace(namespace), { report, knownFormatters });
		if (!isReportEmpty(report)) reports.set(`${localDir}/${namespace}`, report);

		// A namespace with nothing translated merges down to an empty object; leaving the
		// file alone keeps the `[]` placeholders committed in the repository untouched.
		if (flattenLocale(merged).size === 0) continue;

		const content = Buffer.from(serializeLocale(merged), 'utf8');
		if (existsSync(dest) && readFileSync(dest).equals(content)) continue;
		writes.push({ dest, content });
	}
}

if (scanned === 0) {
	console.error('No locale JSON files found to remap.');
	console.error(`Staging directory preserved for inspection: ${pullRoot}`);
	process.exit(1);
}

// Stage new content next to each destination first: staging is the only phase
// that writes data, so a persistent filesystem failure (full disk, unwritable
// tree) aborts before any live locale file is touched. Promotion and rollback
// are then rename-only metadata operations.
const NEW_SUFFIX = '.tolgee-new';
const BACKUP_SUFFIX = '.tolgee-backup';

function tryRmSync(path: string): void {
	try {
		rmSync(path, { force: true });
	} catch {
		// Best-effort cleanup; leftover temp files are harmless.
	}
}

try {
	for (const { dest, content } of writes) {
		mkdirSync(dirname(dest), { recursive: true });
		writeFileSync(dest + NEW_SUFFIX, content);
	}
} catch (error) {
	for (const { dest } of writes) tryRmSync(dest + NEW_SUFFIX);
	console.error('Failed to stage pulled locales; live locale files were not touched.');
	console.error(String(error));
	console.error(`Staging directory preserved for inspection: ${pullRoot}`);
	process.exit(1);
}

// Promote via rename; if any rename fails, rename every backup back so the
// live locales never stay in a mixed state.
const backups = new Map<string, string | null>();
try {
	for (const { dest } of writes) {
		if (!backups.has(dest)) {
			if (existsSync(dest)) {
				renameSync(dest, dest + BACKUP_SUFFIX);
				backups.set(dest, dest + BACKUP_SUFFIX);
			} else {
				backups.set(dest, null);
			}
		}
		renameSync(dest + NEW_SUFFIX, dest);
	}
} catch (error) {
	const unrestored: string[] = [];
	for (const [dest, backup] of backups) {
		try {
			if (backup === null) rmSync(dest, { force: true });
			else renameSync(backup, dest);
		} catch {
			unrestored.push(backup === null ? dest : `${dest} (backup preserved at ${backup})`);
		}
	}
	for (const { dest } of writes) tryRmSync(dest + NEW_SUFFIX);
	if (unrestored.length > 0) {
		console.error('Rollback failed for the following files; restore them manually:');
		for (const entry of unrestored) console.error(`  - ${entry}`);
	}
	console.error('Failed to promote pulled locales; previously promoted files were rolled back.');
	console.error(String(error));
	console.error(`Staging directory preserved for inspection: ${pullRoot}`);
	process.exit(1);
}
for (const backup of backups.values()) {
	if (backup !== null) tryRmSync(backup);
}

rmSync(pullRoot, { recursive: true, force: true });

// Report. Rejected translations are the interesting part: they are data problems on the
// Tolgee side that nobody would otherwise notice, since the value is simply not applied.
const summary = buildSummary();
writeFileSync(reportPath, summary, 'utf8');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');

console.log(
	writes.length === 0
		? `Scanned ${scanned} staged locale files; no translation changes to apply.`
		: `Updated ${writes.length} of ${scanned} staged locale files in src/languages/`
);
for (const [namespace, report] of reports) {
	const parts: string[] = [];
	if (report.updated.length > 0) parts.push(`${report.updated.length} updated`);
	if (report.skipped.length > 0) parts.push(`${report.skipped.length} rejected`);
	if (report.pruned.length > 0) parts.push(`${report.pruned.length} pruned`);
	if (report.orphaned.length > 0) parts.push(`${report.orphaned.length} orphaned`);
	if (report.malformed.length > 0) parts.push(`${report.malformed.length} malformed`);
	console.log(`  ${namespace}: ${parts.join(', ')}`);
}
console.log(`Report written to ${reportPath}`);

function buildSummary(): string {
	const lines = ['*bleep bloop* I synced the translations from Tolgee', ''];
	const updated = [...reports.values()].reduce((total, report) => total + report.updated.length, 0);
	const pruned = [...reports.values()].reduce((total, report) => total + report.pruned.length, 0);
	lines.push(`- **${updated}** translation${updated === 1 ? '' : 's'} applied across **${writes.length}** file${writes.length === 1 ? '' : 's'}`);
	if (pruned > 0) lines.push(`- **${pruned}** key${pruned === 1 ? '' : 's'} pruned (no longer defined in ${BASE_LOCALE})`);
	lines.push(`- \`src/languages/${BASE_LOCALE}\` untouched (source of truth, push-only)`);

	const rejected = [...reports].flatMap(([namespace, report]) => report.skipped.map((entry) => ({ namespace, ...entry })));
	if (rejected.length > 0) {
		lines.push(
			'',
			`### ⚠️ ${rejected.length} translation${rejected.length === 1 ? '' : 's'} rejected`,
			'',
			`The placeholders do not match ${BASE_LOCALE}, so the value was left untranslated. Fix these on Tolgee:`,
			'',
			'| File | Key | Expected | Got |',
			'| --- | --- | --- | --- |'
		);
		for (const entry of rejected.slice(0, 50)) {
			lines.push(`| \`${entry.namespace}\` | \`${entry.path}\` | \`${inline(entry.base)}\` | \`${inline(entry.translated)}\` |`);
		}
		if (rejected.length > 50) lines.push('', `…and ${rejected.length - 50} more.`);
	}

	const orphaned = [...reports].flatMap(([namespace, report]) => report.orphaned.map((path) => `${namespace}:${path}`));
	if (orphaned.length > 0) {
		lines.push(
			'',
			`### 🗂️ ${orphaned.length} translated key${orphaned.length === 1 ? '' : 's'} no longer defined in ${BASE_LOCALE}`,
			'',
			`These were kept — they still hold translations, most likely because the key moved to another namespace. Move the text to its new home (or delete it) by hand:`,
			''
		);
		for (const entry of orphaned.slice(0, 50)) lines.push(`- \`${entry}\``);
		if (orphaned.length > 50) lines.push('', `…and ${orphaned.length - 50} more.`);
	}

	const malformed = [...reports].flatMap(([namespace, report]) => report.malformed.map((entry) => ({ namespace, ...entry })));
	if (malformed.length > 0) {
		lines.push('', `### ⚠️ ${malformed.length} array${malformed.length === 1 ? '' : 's'} could not be rebuilt`, '');
		for (const entry of malformed.slice(0, 50)) lines.push(`- \`${entry.namespace}\` → \`${entry.path}\`: ${entry.reason}`);
	}

	return `${lines.join('\n')}\n`;
}

function inline(value: string): string {
	const collapsed = value.replaceAll('|', '\\|').replaceAll('\n', ' ').trim();
	return collapsed.length > 80 ? `${collapsed.slice(0, 77)}…` : collapsed;
}
