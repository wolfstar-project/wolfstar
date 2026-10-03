import { isNullish } from '@sapphire/utilities';
import { container, type Command } from '@wolfstar/http-framework';

/**
 * The commands are matched by the names they are stored with, which can be, from the most to the least specific:
 *
 * - `*`: every command.
 * - `category.*`: every command of a category.
 * - `category.subCategory.*`: every command of a sub-category.
 * - `category.command`, `category.subCategory.command` and `command`: a command.
 *
 * The category and the sub-category of a command are the first and the second directory of its file under
 * `commands/`. The commands are chat input commands, so there are no aliases, and a command is the top-level one:
 * the subcommands are routed through their parent, which is the command that interactions resolve to.
 */

/**
 * Gets the category of a command, which is the first directory of its file under `commands/`.
 *
 * @param command - The command to get the category of.
 */
export function getCategory(command: Command): string | null {
	return command.location.directories[0] ?? null;
}

/**
 * Gets the sub-category of a command, which is the second directory of its file under `commands/`.
 *
 * @param command - The command to get the sub-category of.
 */
export function getSubCategory(command: Command): string | null {
	return command.location.directories[1] ?? null;
}

function getNameSpaceDetails(name: string): readonly [string | null, string] {
	const index = name.indexOf('.');
	if (index === -1) return [null, name];
	return [name.substring(0, index), name.substring(index + 1)];
}

function matchName(name: string, command: Command): boolean {
	return command.name.toLowerCase() === name.toLowerCase();
}

function matchNameAndCategory(name: string, category: string, command: Command): boolean {
	return getCategory(command) === category && matchName(name, command);
}

function matchNameCategoryAndSubCategory(name: string, category: string, subCategory: string, command: Command): boolean {
	return getSubCategory(command) === subCategory && matchNameAndCategory(name, category, command);
}

export function matchAny(names: Iterable<string>, command: Command): boolean {
	for (const name of names) {
		if (match(name, command)) return true;
	}
	return false;
}

export function match(name: string, command: Command): boolean {
	// Match All:
	if (name === '*') return true;

	// Match Category:
	const [category, categoryRest] = getNameSpaceDetails(name);
	if (category === null) return matchName(name, command);
	if (category !== getCategory(command)) return false;
	if (categoryRest === '*') return true;

	// Match Sub-Category:
	const [subCategory, subCategoryRest] = getNameSpaceDetails(categoryRest);
	if (subCategory === null) return matchNameAndCategory(categoryRest, category, command);
	if (subCategory !== getSubCategory(command)) return false;
	if (subCategoryRest === '*') return true;

	// Match Command:
	return matchNameCategoryAndSubCategory(subCategoryRest, category, subCategory, command);
}

type Commands = Iterable<Command>;

function resolveCategory(commands: Commands, category: string): string | null {
	const scanned = new Set<string>();
	const lowerCaseCategory = category.toLowerCase();

	for (const command of commands) {
		const value = getCategory(command);
		if (isNullish(value)) continue;
		if (scanned.has(value)) continue;
		if (value.toLowerCase() === lowerCaseCategory) return value;
		scanned.add(value);
	}

	return null;
}

function resolveSubCategory(commands: Commands, category: string, subCategory: string): string | null {
	const scanned = new Set<string>();
	const lowerCaseSubCategory = subCategory.toLowerCase();

	for (const command of commands) {
		if (getCategory(command) !== category) continue;

		const value = getSubCategory(command);
		if (isNullish(value)) continue;

		if (scanned.has(value)) continue;
		if (value.toLowerCase() === lowerCaseSubCategory) return value;
		scanned.add(value);
	}

	return null;
}

function findCommand(commands: Commands, name: string): Command | null {
	for (const command of commands) {
		if (matchName(name, command)) return command;
	}

	return null;
}

function resolveCommandWithCategory(commands: Commands, name: string, category: string): string | null {
	const command = findCommand(commands, name);
	if (command === null) return null;
	return getCategory(command) === category ? command.name : null;
}

function resolveCommandWithCategoryAndSubCategory(commands: Commands, name: string, category: string, subCategory: string): string | null {
	const command = findCommand(commands, name);
	if (command === null) return null;
	return getCategory(command) === category && getSubCategory(command) === subCategory ? command.name : null;
}

/**
 * Resolves the name of a command, a category or a sub-category as it is stored, or `null` if it does not exist.
 *
 * @param name - The name to resolve, in any of the forms described above.
 */
export function resolve(name: string): string | null {
	// Match All:
	if (name === '*') return name;

	const parts = name.split('.');

	// If it's an empty string, or has more than three parts, it is invalid:
	if (parts.length === 0 || parts.length > 3) return null;

	const commands = [...container.stores.get('commands').values()];

	// Handle `${command}`:
	if (parts.length === 1) return findCommand(commands, name)?.name ?? null;

	// Handle `${category}.${string}`:
	const category = resolveCategory(commands, parts[0]);
	if (category === null) return null;
	if (parts.length === 2) return parts[1] === '*' ? `${category}.*` : resolveCommandWithCategory(commands, parts[1], category);

	// Handle `${category}.${category}.${string}`:
	const subCategory = resolveSubCategory(commands, category, parts[1]);
	if (subCategory === null) return null;
	return parts[2] === '*' ? `${category}.${subCategory}.*` : resolveCommandWithCategoryAndSubCategory(commands, parts[2], category, subCategory);
}
