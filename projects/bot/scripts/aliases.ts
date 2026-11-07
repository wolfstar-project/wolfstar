import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const RootDir = resolve(import.meta.dirname, '..');

export function resolveSource(base: string, subPath: string): string {
	if (subPath.endsWith('.ts')) return resolve(RootDir, base, subPath);
	const direct = resolve(RootDir, base, `${subPath}.ts`);
	if (existsSync(direct)) return direct;
	return resolve(RootDir, base, subPath, 'index.ts');
}

function aliasOf(name: string, base: string) {
	return {
		find: name,
		replacement: name,
		customResolver(source: string) {
			if (source === name) return resolve(RootDir, base, 'index.ts');
			return resolveSource(base, source.slice(`${name}/`.length));
		}
	};
}

export const aliasEntries = [
	aliasOf('#lib', 'src/lib'),
	aliasOf('#common', 'src/lib/common'),
	aliasOf('#types', 'src/lib/types'),
	aliasOf('#utils', 'src/lib/utilities'),
	aliasOf('#root', 'src')
];
