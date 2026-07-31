/**
 * Remap Tolgee pull output into WolfStar language directories.
 *
 * Reads .tolgee-pull/{tag}/{namespace}.json → src/languages/{locale}/{namespace}.json
 *
 * Tolgee short tags (en, es, pt, …) are remapped to Discord locale folder names
 * (en-US, es-ES, pt-BR, …) using `tolgeeToLocal` from `.tolgeerc.cjs`. Nested
 * namespaces (commands/admin, events/errors) are preserved. Non-JSON files such
 * as constants.ts are never touched.
 *
 * Usage:  pnpm tolgee:pull
 *         (or: pnpm exec tolgee pull && node --experimental-strip-types scripts/tolgee-pull-remap.ts)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, type Dirent } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const pullRoot = join(root, config.pull.path.replace(/^\.\//, ''));
const languagesRoot = join(root, 'src/languages');

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
// (e.g. `tolgee pull --languages en es it`), so remap only the mapped
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

// Build and validate the full replacement tree in memory before touching
// src/languages/, so an unreadable or invalid staging file cannot leave the
// live locale tree partially updated.
const writes: { dest: string; content: Buffer }[] = [];
for (const tag of mappedTags) {
	const localDir = resolveLocalDir(tag);
	if (!localDir) continue;
	const namespaces = collectJsonFiles(join(pullRoot, tag));
	if (namespaces.length === 0) {
		console.warn(`Skipping empty Tolgee language directory: ${tag}`);
		continue;
	}
	for (const ns of namespaces) {
		let content: Buffer;
		try {
			content = readFileSync(join(pullRoot, tag, ns));
			JSON.parse(content.toString('utf8'));
		} catch (error) {
			console.error(`Invalid or unreadable staging file: ${tag}/${ns}`);
			console.error(String(error));
			console.error(`Staging directory preserved for inspection: ${pullRoot}`);
			process.exit(1);
		}
		writes.push({ dest: join(languagesRoot, localDir, ns), content });
	}
}

if (writes.length === 0) {
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
console.log(`Remapped ${writes.length} locale files into src/languages/`);
