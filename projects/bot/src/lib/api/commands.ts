import { getCategory, getSubCategory } from '#lib/database/utils/matchers/Command';
import { ProtectedCommands } from '#lib/structures/commands-menu/disabled';
import { PermissionLevels } from '#lib/types';
import { PreconditionRunCondition, PreconditionRunMode } from '@wolfstar/http-framework';
import type { Command, PreconditionArrayResolvable, PreconditionEntryResolvable } from '@wolfstar/http-framework';
import type { TFunction } from '@wolfstar/plugin-i18next';
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
 * The help of a command, the `extendedHelp` of `GET /commands`.
 *
 * @remarks `usages` and `explainedUsage` are read from what the command registers with Discord, so they are always
 * right; the other ones are the texts of `commands/help` written for the command, see {@linkcode CommandHelpTexts}.
 */
export interface FlattenedCommandHelp {
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
 * - `possibleFormats`: the formats a value can be written in, with what each one means.
 * - `reminder`: what is easy to miss.
 *
 * @remarks The slash keeps the keys apart from the ones of the other namespaces: when the key given to `t()` is not
 * known (`t(key as TranslationKey)`), the typings of i18next look its last part up in every namespace, so a help
 * keyed `permissions`, as `commands/moderation:permissions` is, typed what `t()` returns as an object too.
 */
type CommandHelpTexts = Pick<FlattenedCommandHelp, 'extendedHelp' | 'examples' | 'possibleFormats' | 'reminder'>;

/**
 * A command as `GET /commands` lists it.
 *
 * @remarks The fields are the ones the message commands of the original bot had, which the website reads:
 *
 * - `alias` is always empty, a chat input command has no aliases.
 * - `guarded` is whether a server cannot disable the command, see {@linkcode ProtectedCommands}.
 */
export interface FlattenedCommand {
	category: string | null;
	subCategory: string | null;
	alias: string[];
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
 * Reads a command for `GET /commands`.
 *
 * @param command - The command piece.
 * @param data - What the command registers with Discord.
 * @param locale - The locale to write the texts in, `null` for the default ones.
 * @param t - The function to read `commands/help` with, fixed to the same locale.
 */
export function flattenCommand(command: Command, data: ChatInputCommandData, locale: string | null, t: TFunction): FlattenedCommand {
	const { preconditions } = command.options;
	return {
		category: getCategory(command),
		subCategory: getSubCategory(command),
		alias: [],
		description: localize(data.description, data.description_localizations, locale),
		extendedHelp: getCommandHelp(t, data, locale),
		guarded: ProtectedCommands.has(command.name),
		name: data.name,
		permissionLevel: getCommandPermissionLevel(preconditions, data.default_member_permissions),
		preconditions: getCommandPreconditions(preconditions, data.contexts)
	};
}

/**
 * Builds the help of a command: its usages and their explanation, and the texts written for it in `commands/help`.
 *
 * @remarks A text that is missing, or that is not of the shape {@linkcode CommandHelpTexts} gives it, is left out.
 *
 * @param t - The function to translate with.
 * @param data - What the command registers with Discord.
 * @param locale - The locale to write the usages in, `null` for the default names and descriptions.
 */
export function getCommandHelp(t: TFunction, data: ChatInputCommandData, locale: string | null): FlattenedCommandHelp {
	const texts = readCommandHelpTexts(t, data.name);
	const help: FlattenedCommandHelp = { usages: getCommandUsages(data, locale) };
	if (texts.extendedHelp) help.extendedHelp = texts.extendedHelp;

	const explainedUsage = getCommandExplainedUsage(data, locale);
	if (explainedUsage.length > 0) help.explainedUsage = explainedUsage;
	if (texts.possibleFormats) help.possibleFormats = texts.possibleFormats;
	if (texts.examples) help.examples = texts.examples;
	if (texts.reminder) help.reminder = texts.reminder;
	return help;
}

/**
 * Writes the ways a command can be run: one for each subcommand, or the command itself when it has none, with its
 * options after it (`add <user> [reason]`, a required one in angle brackets).
 *
 * @param data - What the command registers with Discord.
 * @param locale - The locale to write the names in, `null` for the default ones.
 */
export function getCommandUsages(data: ChatInputCommandData, locale: string | null): string[] {
	return getCommandPaths(data, locale).map(({ path, options }) =>
		[path, ...options.map((option) => formatOption(option, locale))].filter((part) => part.length > 0).join(' ')
	);
}

/**
 * Explains the usages of a command: each subcommand with its description, then each option once with its own.
 *
 * @remarks An option is written with its subcommand (`list [user]`) when its name is the one of a subcommand, or when
 * two subcommands describe it differently, so every explanation says what it is about.
 *
 * @param data - What the command registers with Discord.
 * @param locale - The locale to write the names and the descriptions in, `null` for the default ones.
 */
export function getCommandExplainedUsage(data: ChatInputCommandData, locale: string | null): [string, string][] {
	const paths = getCommandPaths(data, locale);
	const entries: [string, string][] = paths.filter(({ path }) => path.length > 0).map(({ path, description }) => [path, description]);

	// The names an option cannot be written alone with: the ones of the subcommands, and the ones described twice.
	const descriptions = new Map<string, Set<string>>();
	for (const { options } of paths) {
		for (const option of options) {
			const name = localize(option.name, option.name_localizations, locale);
			const description = localize(option.description, option.description_localizations, locale);
			descriptions.set(name, (descriptions.get(name) ?? new Set()).add(description));
		}
	}

	const subcommands = new Set(entries.map(([path]) => path));
	const written = new Set<string>();
	for (const { path, options } of paths) {
		for (const option of options) {
			const name = localize(option.name, option.name_localizations, locale);
			const description = localize(option.description, option.description_localizations, locale);
			const label = subcommands.has(name) || descriptions.get(name)!.size > 1 ? `${path} ${formatOption(option, locale)}` : name;

			const key = `${label}\n${description}`;
			if (written.has(key)) continue;
			written.add(key);
			entries.push([label, description]);
		}
	}

	return entries;
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
 * A way to run a command: a subcommand by its path under the command (`add`, `rule add`), or the command itself (an
 * empty path), with its options.
 */
interface CommandPath {
	path: string;
	description: string;
	options: readonly APIApplicationCommandBasicOption[];
}

function getCommandPaths(data: ChatInputCommandData, locale: string | null): CommandPath[] {
	const options = data.options ?? [];
	const paths = getSubcommandPaths(options, locale, '');
	if (paths.length > 0) return paths;

	const description = localize(data.description, data.description_localizations, locale);
	return [{ path: '', description, options: options as readonly APIApplicationCommandBasicOption[] }];
}

function getSubcommandPaths(options: readonly APIApplicationCommandOption[], locale: string | null, prefix: string): CommandPath[] {
	const paths: CommandPath[] = [];
	for (const option of options) {
		const path = `${prefix}${localize(option.name, option.name_localizations, locale)}`;
		if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
			paths.push(...getSubcommandPaths(option.options ?? [], locale, `${path} `));
		} else if (option.type === ApplicationCommandOptionType.Subcommand) {
			const description = localize(option.description, option.description_localizations, locale);
			paths.push({ path, description, options: option.options ?? [] });
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
