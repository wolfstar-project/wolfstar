import type { Snowflake } from 'discord-api-types/v10';

/**
 * How many channels, or roles, a select menu of the modal of a restriction shows and lets pick. A list that is stored
 * keeps every entry: the ones a server set up before, a channel at a time, can be more than that.
 */
export const MaximumCommandRestrictionEntries = 25;

/**
 * Where and by whom a server lets a command be run, which the modal of `/commands` edits.
 *
 * - `allowedChannels`: when it has any, the command only runs in them.
 * - `ignoredChannels`: the command does not run in them.
 * - `allowedRoles`: when it has any, only the members with one of them run the command.
 * - `ignoredRoles`: the members with one of them do not run the command.
 *
 * An ignored channel or role wins over an allowed one.
 */
export interface CommandRestriction {
	/**
	 * The name of the command, the one of its piece: a subcommand is restricted with its parent.
	 */
	command: string;
	allowedChannels: Snowflake[];
	ignoredChannels: Snowflake[];
	allowedRoles: Snowflake[];
	ignoredRoles: Snowflake[];
}

/**
 * The lists of a restriction.
 */
export const CommandRestrictionLists = ['allowedChannels', 'ignoredChannels', 'allowedRoles', 'ignoredRoles'] as const;
export type CommandRestrictionList = (typeof CommandRestrictionLists)[number];

function createCommandRestriction(command: string): CommandRestriction {
	return { command, allowedChannels: [], ignoredChannels: [], allowedRoles: [], ignoredRoles: [] };
}

function isSnowflake(value: unknown): value is Snowflake {
	return typeof value === 'string' && /^\d{17,20}$/.test(value);
}

function readList(value: unknown): Snowflake[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.filter((entry) => isSnowflake(entry)))];
}

/**
 * Reads the restrictions of the commands of a server from what the database holds.
 *
 * @remarks
 *
 * The column is a JSON one whose table is owned outside this repository, so what it holds is checked and not trusted.
 * It used to hold the commands each channel disabled (`{ channel, commands }`): an entry of that shape is read as the
 * channel being ignored by each of its commands, so what a server set up before keeps doing what it did.
 *
 * @param value - The value of `commandsRestrictions`.
 */
export function readCommandRestrictions(value: unknown): CommandRestriction[] {
	if (!Array.isArray(value)) return [];

	const restrictions = new Map<string, CommandRestriction>();
	const get = (command: string) => {
		const known = restrictions.get(command);
		if (known !== undefined) return known;

		const created = createCommandRestriction(command);
		restrictions.set(command, created);
		return created;
	};

	for (const entry of value as unknown[]) {
		if (typeof entry !== 'object' || entry === null) continue;

		const data = entry as Record<string, unknown>;
		if (typeof data.command === 'string' && data.command.length > 0) {
			const restriction = get(data.command);
			for (const list of CommandRestrictionLists) restriction[list] = readList([...restriction[list], ...readList(data[list])]);
		} else if (isSnowflake(data.channel) && Array.isArray(data.commands)) {
			for (const command of data.commands) {
				if (typeof command !== 'string' || command.length === 0) continue;

				const restriction = get(command);
				restriction.ignoredChannels = readList([...restriction.ignoredChannels, data.channel]);
			}
		}
	}

	return [...restrictions.values()].filter((restriction) => !isCommandRestrictionEmpty(restriction));
}

/**
 * Whether a restriction restricts nothing, and so is not worth keeping.
 */
export function isCommandRestrictionEmpty(restriction: CommandRestriction): boolean {
	return CommandRestrictionLists.every((list) => restriction[list].length === 0);
}

/**
 * Finds the restriction of a command, an empty one when the server did not restrict it.
 *
 * @param restrictions - The restrictions of the server.
 * @param command - The name of the command.
 */
export function findCommandRestriction(restrictions: readonly CommandRestriction[], command: string): CommandRestriction {
	return restrictions.find((restriction) => restriction.command === command) ?? createCommandRestriction(command);
}

/**
 * Sets the restriction of a command in the restrictions of a server, and drops it when it restricts nothing.
 *
 * @param restrictions - The restrictions of the server.
 * @param restriction - The restriction to set.
 * @returns The new restrictions.
 */
export function setCommandRestriction(restrictions: readonly CommandRestriction[], restriction: CommandRestriction): CommandRestriction[] {
	const others = restrictions.filter((entry) => entry.command !== restriction.command);
	const [next] = readCommandRestrictions([restriction]);
	return next === undefined ? others : [...others, next];
}

/**
 * Adds to what the modal of a command picked the entries of the stored restriction that the modal could not show, the
 * ones past the {@linkcode MaximumCommandRestrictionEntries} of a select menu, so saving the modal does not drop them.
 *
 * @param picked - What the modal picked.
 * @param stored - The restriction the modal was opened with.
 * @returns The restriction to save.
 */
export function keepHiddenRestrictionEntries(picked: CommandRestriction, stored: CommandRestriction): CommandRestriction {
	const next = createCommandRestriction(picked.command);
	for (const list of CommandRestrictionLists) next[list] = readList([...picked[list], ...stored[list].slice(MaximumCommandRestrictionEntries)]);
	return next;
}

/**
 * The revision of what the modal of a command edits: whether the command is disabled by its name, and its restriction.
 * The modal carries the one it was opened with, so a modal that was opened before another administrator saved the
 * command is refused instead of undoing what they saved.
 *
 * @param restriction - The restriction of the command.
 * @param disabled - Whether `commands.disabled` has the name of the command.
 * @returns A hash of 32 bits (FNV-1a), which fits a custom ID.
 */
export function getCommandRestrictionRevision(restriction: CommandRestriction, disabled: boolean): number {
	const text = JSON.stringify([disabled, ...CommandRestrictionLists.map((list) => restriction[list])]);
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}

	return hash;
}

/**
 * Takes a channel, or a role, that is gone out of every restriction.
 *
 * @param restrictions - The restrictions of the server.
 * @param id - The ID of the channel or of the role.
 * @returns The new restrictions, or `null` when none of them had it.
 */
export function removeFromCommandRestrictions(restrictions: readonly CommandRestriction[], id: Snowflake): CommandRestriction[] | null {
	if (!restrictions.some((restriction) => CommandRestrictionLists.some((list) => restriction[list].includes(id)))) return null;

	return restrictions
		.map((restriction) => {
			const next = createCommandRestriction(restriction.command);
			for (const list of CommandRestrictionLists) next[list] = restriction[list].filter((entry) => entry !== id);
			return next;
		})
		.filter((restriction) => !isCommandRestrictionEmpty(restriction));
}

/**
 * Where a command is being run, and by whom.
 */
export interface CommandRestrictionTarget {
	/**
	 * The channel, and its parent when it is a thread: a thread is restricted as the channel it is in.
	 */
	channelIds: readonly Snowflake[];

	/**
	 * The roles of the member, the one of everybody (the ID of the guild) included.
	 */
	roleIds: readonly Snowflake[];
}

/**
 * Says what of a restriction keeps a command from being run.
 *
 * @param restriction - The restriction of the command.
 * @param target - Where the command is being run, and by whom.
 * @returns `channel` or `role`, `null` when the command can be run.
 */
export function getCommandRestrictionDenial(restriction: CommandRestriction, target: CommandRestrictionTarget): 'channel' | 'role' | null {
	const inChannels = (list: readonly Snowflake[]) => target.channelIds.some((id) => list.includes(id));
	const hasRoles = (list: readonly Snowflake[]) => target.roleIds.some((id) => list.includes(id));

	if (inChannels(restriction.ignoredChannels)) return 'channel';
	if (restriction.allowedChannels.length > 0 && !inChannels(restriction.allowedChannels)) return 'channel';
	if (hasRoles(restriction.ignoredRoles)) return 'role';
	if (restriction.allowedRoles.length > 0 && !hasRoles(restriction.allowedRoles)) return 'role';

	return null;
}
