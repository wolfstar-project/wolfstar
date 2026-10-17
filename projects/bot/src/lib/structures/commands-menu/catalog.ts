import { getCategory } from '#lib/database/utils/matchers/Command';
import { container } from '@wolfstar/http-framework';
import {
	ApplicationCommandOptionType,
	ApplicationCommandType,
	Routes,
	type APIApplicationCommand,
	type APIApplicationCommandOption,
	type RESTPostAPIChatInputApplicationCommandsJSONBody,
	type Snowflake
} from 'discord-api-types/v10';

/**
 * A subcommand of a command, by its full path (`rule add` for the `add` subcommand of the `rule` group).
 */
export interface CatalogSubcommand {
	name: string;
	description: string;
}

/**
 * A slash command as the commands menu shows it.
 */
export interface CatalogCommand {
	name: string;
	description: string;

	/**
	 * The first directory of the file of the command under `commands/`, which the menu groups the commands by.
	 */
	category: string;
	subcommands: CatalogSubcommand[];

	/**
	 * The context menu commands the same piece registers, such as `Report Message`.
	 */
	contextMenus: string[];

	/**
	 * The permissions Discord asks of a member to show them the command, `null` when everybody sees it.
	 */
	permissions: bigint | null;
}

/**
 * The category of the commands whose file is directly under `commands/`.
 */
const DefaultCategory = 'General';

/**
 * Lists the slash commands of the bot, by name, with their descriptions in a locale.
 *
 * @remarks The commands are read from the registry they are registered to Discord from, so the menu shows what Discord
 * shows. A subcommand is a piece of its own, but it is listed under its parent, the only one the registry knows.
 *
 * @param locale - The locale to take the descriptions in, the default ones are used where it has none.
 */
export function getCommandCatalog(locale: string): CatalogCommand[] {
	const registered = new Map<string, RESTPostAPIChatInputApplicationCommandsJSONBody>();
	for (const entry of container.applicationCommandRegistry.toJSON()) {
		if ((entry.type ?? ApplicationCommandType.ChatInput) === ApplicationCommandType.ChatInput) {
			registered.set(entry.name, entry as RESTPostAPIChatInputApplicationCommandsJSONBody);
		}
	}

	const commands: CatalogCommand[] = [];
	for (const piece of container.stores.get('commands').values()) {
		const name = piece.router.chatInputName;
		const data = name === null ? undefined : registered.get(name);
		if (name === null || data === undefined) continue;

		commands.push(
			toCatalogCommand(data, locale, {
				category: getCategory(piece) ?? DefaultCategory,
				contextMenus: piece.router.contextMenuNames
			})
		);
	}

	return commands.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Reads a command from the data it is registered with.
 */
export function toCatalogCommand(
	data: RESTPostAPIChatInputApplicationCommandsJSONBody,
	locale: string,
	extra: Pick<CatalogCommand, 'category' | 'contextMenus'>
): CatalogCommand {
	return {
		name: data.name,
		description: localize(data.description, data.description_localizations, locale),
		category: extra.category,
		subcommands: getSubcommands(data.options ?? [], locale),
		contextMenus: [...extra.contextMenus],
		permissions: data.default_member_permissions ? BigInt(data.default_member_permissions) : null
	};
}

function getSubcommands(options: readonly APIApplicationCommandOption[], locale: string, prefix = ''): CatalogSubcommand[] {
	const subcommands: CatalogSubcommand[] = [];
	for (const option of options) {
		if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
			subcommands.push(...getSubcommands(option.options ?? [], locale, `${prefix}${option.name} `));
		} else if (option.type === ApplicationCommandOptionType.Subcommand) {
			subcommands.push({
				name: `${prefix}${option.name}`,
				description: localize(option.description, option.description_localizations, locale)
			});
		}
	}

	return subcommands;
}

function localize(value: string, localizations: Partial<Record<string, string | null>> | null | undefined, locale: string) {
	return localizations?.[locale] ?? value;
}

/**
 * The categories of a catalog with how many commands each has, by name.
 */
export function getCommandCategories(commands: readonly CatalogCommand[]): { name: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const command of commands) counts.set(command.category, (counts.get(command.category) ?? 0) + 1);
	return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The longest query a search takes, which has to fit in a custom ID with the rest of what a click needs.
 */
export const CommandQueryMaximumLength = 32;

/**
 * Brings what a user searched for to what a custom ID can carry and a search compares: lowercase letters, digits,
 * hyphens and single spaces.
 */
export function normalizeCommandQuery(query: string): string {
	return query
		.toLowerCase()
		.replaceAll(/[^\p{L}\p{N}\- ]+/gu, ' ')
		.replaceAll(/\s+/g, ' ')
		.trim()
		.slice(0, CommandQueryMaximumLength)
		.trim();
}

/**
 * A command that can be run, as the menu lists it: a command with no subcommands, or one subcommand of a command that
 * has them, since the parent of a subcommand cannot be run by itself.
 */
export interface CatalogEntry {
	/**
	 * What a user writes after the slash, `ban` or `automod rule add`.
	 */
	path: string;
	description: string;
	command: CatalogCommand;

	/**
	 * The path of the subcommand under its command, `null` for a command that has none.
	 */
	subcommand: string | null;
}

/**
 * Lists what can be run in a catalog, by path.
 *
 * @param commands - The commands of the catalog.
 */
export function listCatalogEntries(commands: readonly CatalogCommand[]): CatalogEntry[] {
	const entries: CatalogEntry[] = [];
	for (const command of commands) {
		if (command.subcommands.length === 0) {
			entries.push({ path: command.name, description: command.description, command, subcommand: null });
			continue;
		}

		for (const subcommand of command.subcommands) {
			entries.push({ path: `${command.name} ${subcommand.name}`, description: subcommand.description, command, subcommand: subcommand.name });
		}
	}

	return entries.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Searches the entries whose path, description, category or context menu commands have every word of a query. The ones
 * whose path has the query come first.
 *
 * @param entries - The entries to search in, see {@linkcode listCatalogEntries}.
 * @param query - The query, normalized with {@linkcode normalizeCommandQuery}.
 */
export function searchCatalogEntries(entries: readonly CatalogEntry[], query: string): CatalogEntry[] {
	const words = query.split(' ').filter((word) => word.length > 0);
	if (words.length === 0) return [];

	const matches = entries.filter((entry) => {
		const haystack = [entry.path, entry.description, entry.command.category, ...entry.command.contextMenus].join('\n').toLowerCase();
		return words.every((word) => haystack.includes(word));
	});

	const inPath = (entry: CatalogEntry) => (entry.path.includes(query) ? 0 : 1);
	return matches.sort((a, b) => inPath(a) - inPath(b) || a.path.localeCompare(b.path));
}

let commandIds: Promise<Map<string, Snowflake>> | null = null;

/**
 * The IDs Discord gave the commands, by name, with which a command is mentioned so a click writes it.
 *
 * @remarks They are asked for once. Without them (the request failed, or the commands are registered to a guild and
 * not globally) the commands are written as text, and they are asked for again the next time.
 */
export async function fetchCommandIds(): Promise<Map<string, Snowflake>> {
	commandIds ??= (async () => {
		const applicationId = process.env.CLIENT_ID;
		const commands = (await container.rest.get(Routes.applicationCommands(applicationId))) as APIApplicationCommand[];
		return new Map(commands.filter((command) => command.type === ApplicationCommandType.ChatInput).map((command) => [command.name, command.id]));
	})();

	try {
		const ids = await commandIds;
		if (ids.size === 0) commandIds = null;
		return ids;
	} catch {
		commandIds = null;
		return new Map();
	}
}
