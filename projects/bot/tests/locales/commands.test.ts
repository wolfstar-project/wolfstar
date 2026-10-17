import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

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
