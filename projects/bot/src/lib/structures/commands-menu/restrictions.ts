import { match } from '#lib/database/utils/matchers/Command';
import type { Command } from '@wolfstar/http-framework';
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
 * - `allowedRoles`: when it has any, members with one of them, or an allowed user, can run the command.
 * - `ignoredRoles`: the members with one of them do not run the command.
 *
 * - `allowedUsers`: members allowed even without an allowed role.
 * - `ignoredUsers`: members who cannot run the command, even with an allowed role.
 *
 * Any ignored entry wins. These restrictions never grant the base permissions of a command.
 */
export interface CommandRestriction {
	/**
	 * The target of the rule: the name of a command, the one of its piece (a subcommand is restricted with its parent),
	 * or a group of commands, `Category.SubCategory.*`, `Category.*` or `*`, see `getCommandRuleSpecificity`.
	 */
	command: string;
	allowedChannels: Snowflake[];
	ignoredChannels: Snowflake[];
	allowedRoles: Snowflake[];
	ignoredRoles: Snowflake[];
	allowedUsers: Snowflake[];
	ignoredUsers: Snowflake[];
}

/**
 * The lists of a restriction.
 */
export const CommandChannelLists = ['allowedChannels', 'ignoredChannels'] as const;
export const CommandRestrictionLists = [...CommandChannelLists, 'allowedRoles', 'ignoredRoles', 'allowedUsers', 'ignoredUsers'] as const;

/**
 * The two rules of the members of a restriction: each is one select menu of the modal that holds the roles and the users
 * of both lists.
 */
export const CommandMemberRules = ['allowed', 'ignored'] as const;
export type CommandMemberRule = (typeof CommandMemberRules)[number];

export interface CommandMember {
	id: Snowflake;
	type: 'role' | 'user';
}
export type CommandRestrictionList = (typeof CommandRestrictionLists)[number];

function createCommandRestriction(command: string): CommandRestriction {
	return { command, allowedChannels: [], ignoredChannels: [], allowedRoles: [], ignoredRoles: [], allowedUsers: [], ignoredUsers: [] };
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
 * A list saved before {@linkcode CommandRestrictionsFormat} has no marker, and an allowed role or user meant "only
 * these": its rules that allow someone also ignore `@everyone`, which is what "only these" is now that an allowed entry
 * is an exception. The next write stores the marker, so a rule saved by the menu since is never read that way again.
 *
 * @param value - The value of `commandsRestrictions`.
 * @param guildId - The ID of the guild, which is the one of its `@everyone` role.
 */
export function readCommandRestrictions(value: unknown, guildId: Snowflake): CommandRestriction[] {
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

	const read = [...restrictions.values()].filter((restriction) => !isCommandRestrictionEmpty(restriction));
	if (hasFormatMarker(value)) return read;

	return read.map((restriction) =>
		restriction.allowedRoles.length > 0 || restriction.allowedUsers.length > 0
			? { ...restriction, ignoredRoles: readList([...restriction.ignoredRoles, guildId]) }
			: restriction
	);
}

/**
 * The format of the rules the bot writes: the rules can name a category or every command, an allowed entry is an
 * exception, and the member's rule, then the one of their highest role, decide. It is stored as an entry of its own,
 * `{ format: 2 }`, which is not a rule.
 */
export const CommandRestrictionsFormat = 2;

function hasFormatMarker(value: readonly unknown[]): boolean {
	return value.some((entry) => typeof entry === 'object' && entry !== null && (entry as { format?: unknown }).format === CommandRestrictionsFormat);
}

/**
 * What the column holds for the rules of a server: the rules, and the marker of {@linkcode CommandRestrictionsFormat}.
 *
 * @param restrictions - The rules of the server.
 */
export function writeCommandRestrictions(restrictions: readonly CommandRestriction[]): unknown[] {
	return [...restrictions, { format: CommandRestrictionsFormat }];
}

/**
 * How specific the target of a rule is: a command (`warn`, `Moderation.warn`, `Moderation.Management.warn`) is 3, a
 * sub-category (`Moderation.Management.*`) 2, a category (`Moderation.*`) 1 and every command (`*`) 0. Of the rules
 * that match a command for a member or a role, the most specific one decides.
 *
 * @param target - The target, as `lib/database/utils/matchers/Command.ts` writes it.
 */
export function getCommandRuleSpecificity(target: string): 0 | 1 | 2 | 3 {
	if (target === '*') return 0;
	if (!target.endsWith('.*')) return 3;
	return target.split('.').length === 2 ? 1 : 2;
}

/**
 * The rules whose target matches a command, the most specific first.
 *
 * @param restrictions - The rules of the server.
 * @param command - The command, the piece of the parent for a subcommand.
 */
export function findMatchingRestrictions(restrictions: readonly CommandRestriction[], command: Command): CommandRestriction[] {
	return restrictions
		.filter((restriction) => match(restriction.command, command))
		.sort((a, b) => getCommandRuleSpecificity(b.command) - getCommandRuleSpecificity(a.command));
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
	// A rule that is set is of the current format, so it is read as it is, without the upgrade of an older list:
	const [next] = readCommandRestrictions(writeCommandRestrictions([restriction]), '');
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
export function keepHiddenRestrictionEntries(
	picked: CommandRestriction,
	stored: CommandRestriction,
	lists: readonly CommandRestrictionList[] = CommandRestrictionLists
): CommandRestriction {
	const next = { ...stored };
	for (const list of lists) next[list] = readList([...picked[list], ...stored[list].slice(MaximumCommandRestrictionEntries)]);
	return next;
}

/**
 * Lists the roles and then the users of a rule, which is the order the select menu of the modal shows them in.
 */
export function listCommandMembers(restriction: CommandRestriction, rule: CommandMemberRule): CommandMember[] {
	const [roles, users] =
		rule === 'allowed' ? [restriction.allowedRoles, restriction.allowedUsers] : [restriction.ignoredRoles, restriction.ignoredUsers];
	return [...roles.map((id) => ({ id, type: 'role' as const })), ...users.map((id) => ({ id, type: 'user' as const }))];
}

/**
 * Sets the roles and the users a rule picked, keeping the ones the select menu did not show (the entries past the
 * {@linkcode MaximumCommandRestrictionEntries} of {@linkcode listCommandMembers}), so saving the modal does not drop them.
 *
 * @param restriction - The restriction to change, the one the modal was opened with.
 * @param rule - The rule that was picked.
 * @param picked - The roles and the users the select menu returned.
 * @returns A restriction with the rule set.
 */
export function setCommandMembers(
	restriction: CommandRestriction,
	rule: CommandMemberRule,
	picked: { roles: readonly Snowflake[]; users: readonly Snowflake[] }
): CommandRestriction {
	const hidden = listCommandMembers(restriction, rule).slice(MaximumCommandRestrictionEntries);
	const roles = readList([...picked.roles, ...hidden.filter((member) => member.type === 'role').map((member) => member.id)]);
	const users = readList([...picked.users, ...hidden.filter((member) => member.type === 'user').map((member) => member.id)]);
	return rule === 'allowed'
		? { ...restriction, allowedRoles: roles, allowedUsers: users }
		: { ...restriction, ignoredRoles: roles, ignoredUsers: users };
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
export interface CommandRuleSubject {
	userId: Snowflake;

	/**
	 * The channel, and its parent when it is a thread: a thread is restricted as the channel it is in.
	 */
	channelIds: readonly Snowflake[];

	/**
	 * The roles of the member, highest first (by position, then the higher ID), ending with the one of everybody, the
	 * ID of the guild: the highest role a rule names is the one that decides.
	 */
	roleIds: readonly Snowflake[];
}

/**
 * Says what of the rules that match a command keeps a member from running it.
 *
 * @remarks
 *
 * The channels come first: a channel ignored by any of the rules denies, and the allowed channels of the most specific
 * rule that has some are the only ones it runs in. Then the member: the most specific rule that names them decides,
 * and otherwise the one of their highest role that a rule names, with that role's most specific rule. An allowed
 * entry is an exception to an ignored one that ranks below it, it limits nobody else; "only these" is `@everyone`
 * ignored. A rule never grants: what decides before it (Discord, the level of the command) still applies.
 *
 * @param matching - The rules that match the command, see {@linkcode findMatchingRestrictions}.
 * @param subject - Where the command is being run, and by whom.
 * @returns `channel`, `user` or `role`, `null` when the command can be run.
 */
export function getCommandRulesDenial(matching: readonly CommandRestriction[], subject: CommandRuleSubject): 'channel' | 'role' | 'user' | null {
	const rules = [...matching].sort((a, b) => getCommandRuleSpecificity(b.command) - getCommandRuleSpecificity(a.command));
	const inChannels = (list: readonly Snowflake[]) => subject.channelIds.some((id) => list.includes(id));

	if (rules.some((rule) => inChannels(rule.ignoredChannels))) return 'channel';
	const allowedChannels = rules.find((rule) => rule.allowedChannels.length > 0)?.allowedChannels;
	if (allowedChannels !== undefined && !inChannels(allowedChannels)) return 'channel';

	for (const rule of rules) {
		if (rule.ignoredUsers.includes(subject.userId)) return 'user';
		if (rule.allowedUsers.includes(subject.userId)) return null;
	}

	for (const roleId of subject.roleIds) {
		for (const rule of rules) {
			if (rule.ignoredRoles.includes(roleId)) return 'role';
			if (rule.allowedRoles.includes(roleId)) return null;
		}
	}

	return null;
}
