import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Reads the paths of the commands with their options, by name and whether each is required, from
 * `src/@types/commands.d.ts`, which `stars codegen` writes from the builders the commands register:
 * `'ban add': { reason?: string; user: … }`.
 */
async function readCommandPaths() {
	const source = await readFile(join(import.meta.dirname, '../../src/@types/commands.d.ts'), 'utf8');
	const paths = new Map<string, Map<string, boolean>>();

	let current: Map<string, boolean> | null = null;
	let depth = 0;
	for (const line of source.split('\n')) {
		if (current === null) {
			const start = /^ {4}'([^']+)': \{(\};)?$/.exec(line);
			if (start === null) continue;

			const options = new Map<string, boolean>();
			paths.set(start[1], options);
			if (start[2] === undefined) [current, depth] = [options, 1];
			continue;
		}

		const option = depth === 1 ? /^ {6}'?([\w-]+)'?(\?)?: /.exec(line) : null;
		if (option !== null) current.set(option[1], option[2] === undefined);
		depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
		if (depth <= 0) current = null;
	}

	return paths;
}

/**
 * Reads the help of the commands, by their names: the keys of `commands/help.json` are the commands as they are written
 * in Discord (`/ban`), see `CommandHelpTexts`.
 */
async function readHelp() {
	const file = join(import.meta.dirname, '../../src/locales/en-US/commands/help.json');
	const entries = JSON.parse(await readFile(file, 'utf8')) as Record<string, { examples?: string[] }>;
	return new Map(Object.entries(entries).map(([key, value]) => [key.replace(/^\//, ''), { key, ...value }]));
}

describe('the help of the commands', () => {
	test('GIVEN the commands THEN each one has its help in commands/help, and nothing else has one', async () => {
		// `GET /commands` reads the help of a command by its name: a command without one only has its usages.
		const paths = await readCommandPaths();
		const commands = new Set([...paths.keys()].map((path) => path.split(' ')[0]));
		expect(paths.size).toBeGreaterThan(0);

		const help = await readHelp();
		expect([...help.values()].map(({ key }) => key).sort()).toEqual([...commands].map((name) => `/${name}`).sort());
	});

	test('GIVEN the examples of the help THEN each one runs a subcommand of its command, with options it has and every required one', async () => {
		const paths = await readCommandPaths();
		const offenders: string[] = [];
		for (const [name, { examples = [] }] of await readHelp()) {
			for (const example of examples) {
				// The subcommand is what comes before the first option (`add user:@Pete reason:Spam`):
				const options = [...example.matchAll(/(?:^|\s)([a-z\d-]+):/g)];
				const path = [name, example.slice(0, options[0]?.index ?? example.length).trim()].filter(Boolean).join(' ');
				const known = paths.get(path);
				if (known === undefined) {
					offenders.push(`${name}: "${example}" runs ${path}, which does not exist`);
					continue;
				}

				const written = new Set(options.map((option) => option[1]));
				for (const option of written) if (!known.has(option)) offenders.push(`${name}: "${example}" has no option ${option}`);
				for (const [option, required] of known) if (required && !written.has(option)) offenders.push(`${name}: "${example}" lacks ${option}`);
			}
		}

		expect(offenders).toEqual([]);
	});
});

describe('the texts of the commands', () => {
	test('GIVEN the names and the descriptions of the commands THEN none holds the variation selector of an emoji', async () => {
		// Discord drops U+FE0F from what it stores, so a description with it never matches the deployed one and every
		// start of the bot writes the command again (`commands: { register: 'on-start' }`).
		const root = join(import.meta.dirname, '../../src/locales/en-US/commands');
		const offenders: string[] = [];
		for (const file of (await readdir(root)).filter((name) => name.endsWith('.json'))) {
			const entries = JSON.parse(await readFile(join(root, file), 'utf8')) as Record<string, unknown>;
			for (const [key, value] of Object.entries(entries)) {
				if (/(Name|Description)$/.test(key) && typeof value === 'string' && value.includes('️')) offenders.push(`${file}: ${key}`);
			}
		}

		expect(offenders).toEqual([]);
	});
});
