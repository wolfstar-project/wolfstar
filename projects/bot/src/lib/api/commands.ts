import { getCategory, getSubCategory } from '#lib/database/utils/matchers/Command';
import { ProtectedCommands } from '#lib/structures/commands-menu/disabled';
import { CommandPermissionLevel, getRequiredCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { PermissionLevels } from '#lib/types';
import { PreconditionRunCondition, PreconditionRunMode } from '@wolfstar/http-framework';
import type { Command, PreconditionArrayResolvable, PreconditionEntryResolvable } from '@wolfstar/http-framework';
import type { TFunction } from '@wolfstar/plugin-i18next';
import { subCommandsGroupRegistry, subCommandsRegistry } from '@wolfstar/plugin-subcommands-advanced';
import {
	ApplicationCommandOptionType,
	InteractionContextType,
	PermissionFlagsBits,
	type APIApplicationCommandBasicOption,
	type APIApplicationCommandOption,
	type RESTPostAPIChatInputApplicationCommandsJSONBody
} from 'discord-api-types/v10';

/**
 * The data a chat input command is registered with, which is what `GET /commands` reads a command from.
 */
export type ChatInputCommandData = RESTPostAPIChatInputApplicationCommandsJSONBody;

/**
 * A precondition of a command, by the name of its piece.
 */
interface FlattenedCommandPrecondition {
	name: string;
	context: Record<PropertyKey, unknown>;
}

/**
 * The preconditions of a command, in the shape the message commands listed them in: the entries run with
 * `runCondition` (`0` every one has to pass, `1` one has to), and a nested container is an array nested in the
 * `preconditions` option of the command.
 */
export interface FlattenedCommandPreconditions {
	entries: (FlattenedCommandPrecondition | FlattenedCommandPreconditions)[];
	mode: PreconditionRunMode;
	runCondition: PreconditionRunCondition;
}

/**
 * The help of an entry of `GET /commands`, its `extendedHelp`.
 *
 * @remarks `usages` and `explainedUsage` are read from what the command registers with Discord, so they are always
 * right: the options of the entry, after its name. The other ones are the texts of `commands/help` written for its
 * command, see {@linkcode CommandHelpTexts}, which every subcommand of the command shares but for the examples.
 */
interface FlattenedCommandHelp {
	usages?: string[];
	extendedHelp?: string;
	explainedUsage?: [string, string][];
	possibleFormats?: [string, string][];
	examples?: string[];
	reminder?: string;
}

/**
 * What `commands/help.json` holds for a command, by the command as it is written in Discord (`/ban`):
 *
 * - `extendedHelp`: what the command does, beyond its description.
 * - `examples`: ways to run it, as a member writes them after the name of the command (`add user:@Pete reason:Spam`).
 *   A subcommand gets the ones that start with its name, without it.
 * - `possibleFormats`: the formats a value can be written in, with what each one means.
 * - `reminder`: what is easy to miss.
 *
 * @remarks The slash keeps the keys apart from the ones of the other namespaces: when the key given to `t()` is not
 * known (`t(key as TranslationKey)`), the typings of i18next look its last part up in every namespace, so a help
 * keyed `permissions`, as `commands/moderation:permissions` is, typed what `t()` returns as an object too.
 */
type CommandHelpTexts = Pick<FlattenedCommandHelp, 'extendedHelp' | 'examples' | 'possibleFormats' | 'reminder'>;

/**
 * An entry of `GET /commands`: a chat input command with no subcommands, or one of the subcommands of a command, as
 * the message commands of the original bot were each an entry.
 *
 * @remarks The fields are the ones the message commands had, which the website reads, and `command`:
 *
 * - `name` is what is written after the slash, `ban add` for a subcommand.
 * - `command` is the name of the piece of the command, which the settings take: `commands.disabled`, the restrictions
 *   of `/commands` and the permission nodes disable a command, not one of its subcommands, and they write the piece
 *   (`warnThresholds`) where Discord writes `warn-thresholds`.
 * - `alias` is always empty, a chat input command has no aliases.
 * - `guarded` is whether a server cannot disable the command, see {@linkcode ProtectedCommands}.
 */
export interface FlattenedCommand {
	category: string | null;
	subCategory: string | null;
	alias: string[];
	command: string;
	description: string;
	extendedHelp: FlattenedCommandHelp;
	guarded: boolean;
	name: string;
	permissionLevel: PermissionLevels;
	preconditions: FlattenedCommandPreconditions;
}

/**
 * The name of the precondition `GET /commands` lists for a command that only runs in a server, which is how the
 * message commands named it.
 */
const GuildOnlyPrecondition = 'GuildOnly';

/**
 * The precondition pieces of the permission levels, by the level they require.
 */
const PermissionLevelPreconditions: ReadonlyMap<string, PermissionLevels> = new Map([
	['administrator', PermissionLevels.Administrator],
	['moderator', PermissionLevels.Moderator]
]);

/**
 * The precondition pieces that check the levels `RequiresCommandPermissionLevel` requires, which a subcommand lists.
 */
const CommandPermissionLevelPreconditions: Readonly<Record<CommandPermissionLevel, string>> = {
	[CommandPermissionLevel.Moderator]: 'moderator',
	[CommandPermissionLevel.Administrator]: 'administrator'
};

/**
 * Lists the entries of a command for `GET /commands`: the command itself when it has no subcommands, else each of its
 * subcommands, as the commands menu does (`listCatalogEntries`).
 *
 * @remarks Every entry of a command has its category, its help texts and what the settings take it by. A subcommand has
 * its own description, usage and examples, and the level and the preconditions of its command plus the ones its own piece
 * requires (`RequiresCommandPermissionLevel`, `/settings server`).
 *
 * @param command - The command piece.
 * @param data - What the command registers with Discord.
 * @param locale - The locale to write the texts in, `null` for the default ones.
 * @param t - The function to read `commands/help` with, fixed to the same locale.
 */
export function getCommandEntries(command: Command, data: ChatInputCommandData, locale: string | null, t: TFunction): FlattenedCommand[] {
	const texts = readCommandHelpTexts(t, data.name);
	return getCommandPaths(data, locale).map((path) => {
		const preconditions = appendPreconditions(command.options.preconditions, getSubcommandPreconditions(data.name, path.names));
		return {
			category: getCategory(command),
			subCategory: getSubCategory(command),
			alias: [],
			command: command.name,
			description: path.description,
			extendedHelp: getEntryHelp(texts, path, locale),
			guarded: ProtectedCommands.has(command.name),
			name: [data.name, ...path.names].join(' '),
			permissionLevel: getCommandPermissionLevel(preconditions, data.default_member_permissions),
			preconditions: getCommandPreconditions(preconditions, data.contexts)
		};
	});
}

/**
 * Builds the help of an entry: its usage, its options explained, and the texts of its command.
 *
 * @remarks A text that is missing, or that is not of the shape {@linkcode CommandHelpTexts} gives it, is left out.
 */
function getEntryHelp(texts: CommandHelpTexts, path: CommandPath, locale: string | null): FlattenedCommandHelp {
	const help: FlattenedCommandHelp = { usages: [path.options.map((option) => formatOption(option, locale)).join(' ')] };
	if (texts.extendedHelp) help.extendedHelp = texts.extendedHelp;
	if (path.options.length > 0) {
		help.explainedUsage = path.options.map((option) => [
			localize(option.name, option.name_localizations, locale),
			localize(option.description, option.description_localizations, locale)
		]);
	}

	if (texts.possibleFormats) help.possibleFormats = texts.possibleFormats;
	const examples = getEntryExamples(texts.examples ?? [], path);
	if (examples.length > 0) help.examples = examples;
	if (texts.reminder) help.reminder = texts.reminder;
	return help;
}

/**
 * Picks the examples of a command that run an entry, and writes them after its name: `add user:@Pete` is
 * `user:@Pete` for `ban add`, and `add` alone the subcommand with no options.
 */
function getEntryExamples(examples: readonly string[], path: CommandPath): string[] {
	if (path.names.length === 0) return [...examples];

	// The subcommand is written as it is registered, or as the locale names it:
	const prefixes = [...new Set([path.names.join(' '), path.path])];
	const picked: string[] = [];
	for (const example of examples) {
		const prefix = prefixes.find((candidate) => example === candidate || example.startsWith(`${candidate} `));
		if (prefix !== undefined) picked.push(example.slice(prefix.length).trimStart());
	}

	return picked;
}

/**
 * Reads the preconditions the piece of a subcommand requires besides the ones of its command: the level
 * `RequiresCommandPermissionLevel` requires to run it. The `preconditions` option of the piece is not listed:
 * `@wolfstar/plugin-subcommands-advanced` runs its `chatInputRun` for the command and never checks it, only the option of
 * the command is.
 *
 * @param parent - The name of the command, by which `@wolfstar/plugin-subcommands-advanced` registers its subcommands.
 * @param names - The names of the subcommand under the command, none for the command itself.
 */
function getSubcommandPreconditions(parent: string, names: readonly string[]): readonly PreconditionEntryResolvable[] {
	if (names.length === 0) return [];

	const entry =
		names.length === 1 ? subCommandsRegistry.get(parent)?.get(names[0]) : subCommandsGroupRegistry.get(parent)?.get(names[0])?.get(names[1]);
	if (entry === undefined) return [];

	const level = getRequiredCommandPermissionLevel(entry.commandPiece);
	return level === null ? [] : [CommandPermissionLevelPreconditions[level]];
}

function appendPreconditions(
	preconditions: PreconditionArrayResolvable | undefined,
	entries: readonly PreconditionEntryResolvable[]
): PreconditionArrayResolvable | undefined {
	if (entries.length === 0) return preconditions;
	if (preconditions === undefined || isPreconditionArray(preconditions)) return [...(preconditions ?? []), ...entries];
	return { entries: [...preconditions.entries, ...entries], mode: preconditions.mode };
}

/**
 * Reads the permission level of a command: the one of a `moderator` or an `administrator` precondition of its
 * `preconditions` option, else the one the permissions Discord asks of a member to show it stand for (everybody
 * without any, administrator with `Manage Server` or `Administrator`, moderator otherwise).
 *
 * @remarks A level that is nested in the option is one of several ways to run the command, so it is not its level.
 *
 * @param preconditions - The `preconditions` option of the command.
 * @param permissions - The default member permissions of the command.
 */
export function getCommandPermissionLevel(
	preconditions: PreconditionArrayResolvable | undefined,
	permissions: string | null | undefined
): PermissionLevels {
	let level: PermissionLevels | null = null;
	for (const entry of getPreconditionEntries(preconditions)) {
		const name = getPreconditionName(entry);
		const required = name === null ? undefined : PermissionLevelPreconditions.get(name);
		if (required !== undefined && (level === null || required > level)) level = required;
	}

	if (level !== null) return level;
	if (!permissions) return PermissionLevels.Everyone;

	const administrator = PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator;
	return (BigInt(permissions) & administrator) === 0n ? PermissionLevels.Moderator : PermissionLevels.Administrator;
}

/**
 * Lists the preconditions of a command: `GuildOnly` when it only runs in servers, which Discord checks from its
 * contexts, then the entries of its `preconditions` option. The global preconditions are not listed: every command
 * runs them.
 *
 * @param preconditions - The `preconditions` option of the command.
 * @param contexts - The contexts the command is registered for.
 */
export function getCommandPreconditions(
	preconditions: PreconditionArrayResolvable | undefined,
	contexts: readonly InteractionContextType[] | null | undefined
): FlattenedCommandPreconditions {
	const container = flattenPreconditions(preconditions ?? [], PreconditionRunCondition.And, PreconditionRunMode.Sequential);
	const guildOnly = contexts?.length === 1 && contexts[0] === InteractionContextType.Guild;
	if (guildOnly) container.entries.unshift({ name: GuildOnlyPrecondition, context: {} });
	return container;
}

function flattenPreconditions(
	array: PreconditionArrayResolvable,
	runCondition: PreconditionRunCondition,
	inheritedMode: PreconditionRunMode
): FlattenedCommandPreconditions {
	const mode = isPreconditionArray(array) ? inheritedMode : array.mode;
	const nested = runCondition === PreconditionRunCondition.And ? PreconditionRunCondition.Or : PreconditionRunCondition.And;
	const entries = getPreconditionEntries(array).map((entry) =>
		isPreconditionArrayResolvable(entry)
			? flattenPreconditions(entry, nested, mode)
			: { name: getPreconditionName(entry) ?? 'anonymous', context: typeof entry === 'object' ? { ...entry.context } : {} }
	);

	return { entries, mode, runCondition };
}

function getPreconditionEntries(array: PreconditionArrayResolvable | undefined): readonly PreconditionEntryResolvable[] {
	if (array === undefined) return [];
	return isPreconditionArray(array) ? array : array.entries;
}

function isPreconditionArray(array: PreconditionArrayResolvable): array is readonly PreconditionEntryResolvable[] {
	return Array.isArray(array);
}

function isPreconditionArrayResolvable(entry: PreconditionEntryResolvable): entry is PreconditionArrayResolvable {
	return Array.isArray(entry) || (typeof entry === 'object' && 'entries' in entry);
}

function getPreconditionName(entry: PreconditionEntryResolvable): string | null {
	if (typeof entry === 'string') return entry;
	if (typeof entry === 'function') return entry.name || null;
	return isPreconditionArrayResolvable(entry) ? null : entry.name;
}

/**
 * A way to run a command: a subcommand under the command (`add`, `rule add`), or the command itself, with its
 * description and its options.
 */
interface CommandPath {
	/**
	 * The names of the subcommand, as they are registered: `['add']`, `['rule', 'add']`, none for the command itself.
	 */
	names: readonly string[];

	/**
	 * The same names in the requested locale, written as one path.
	 */
	path: string;
	description: string;
	options: readonly APIApplicationCommandBasicOption[];
}

function getCommandPaths(data: ChatInputCommandData, locale: string | null): CommandPath[] {
	const options = data.options ?? [];
	const paths = getSubcommandPaths(options, locale, null);
	if (paths.length > 0) return paths;

	const description = localize(data.description, data.description_localizations, locale);
	return [{ names: [], path: '', description, options: options as readonly APIApplicationCommandBasicOption[] }];
}

function getSubcommandPaths(
	options: readonly APIApplicationCommandOption[],
	locale: string | null,
	group: Pick<CommandPath, 'names' | 'path'> | null
): CommandPath[] {
	const paths: CommandPath[] = [];
	for (const option of options) {
		const names = [...(group?.names ?? []), option.name];
		const path = [group?.path, localize(option.name, option.name_localizations, locale)].filter(Boolean).join(' ');
		if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
			paths.push(...getSubcommandPaths(option.options ?? [], locale, { names, path }));
		} else if (option.type === ApplicationCommandOptionType.Subcommand) {
			const description = localize(option.description, option.description_localizations, locale);
			paths.push({ names, path, description, options: option.options ?? [] });
		}
	}

	return paths;
}

function formatOption(option: APIApplicationCommandBasicOption, locale: string | null) {
	const name = localize(option.name, option.name_localizations, locale);
	return option.required ? `<${name}>` : `[${name}]`;
}

function localize(value: string, localizations: Partial<Record<string, string | null>> | null | undefined, locale: string | null) {
	return (locale === null ? null : localizations?.[locale]) ?? value;
}

function readCommandHelpTexts(t: TFunction, name: string): CommandHelpTexts {
	const value: unknown = (t as unknown as (key: string, options: { returnObjects: true }) => unknown)(`commands/help:/${name}`, {
		returnObjects: true
	});
	if (typeof value !== 'object' || value === null) return {};

	const texts = value as Record<keyof CommandHelpTexts, unknown>;
	return {
		extendedHelp: isText(texts.extendedHelp) ? texts.extendedHelp : undefined,
		examples: isExampleArray(texts.examples) ? texts.examples : undefined,
		possibleFormats: isPairArray(texts.possibleFormats) ? texts.possibleFormats : undefined,
		reminder: isText(texts.reminder) ? texts.reminder : undefined
	};
}

function isText(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

/**
 * Whether a value is a list of examples. An example can be empty: it is the command run with no options (`/commands`).
 */
function isExampleArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.length > 0 && value.every((example) => typeof example === 'string');
}

function isPairArray(value: unknown): value is [string, string][] {
	return Array.isArray(value) && value.length > 0 && value.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every(isText));
}
