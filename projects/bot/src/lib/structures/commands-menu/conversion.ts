import { match, resolve } from '#lib/database/utils/matchers/Command';
import { ProtectedCommands } from '#lib/structures/commands-menu/disabled';
import {
	findCommandRestriction,
	getCommandRuleSpecificity,
	setCommandRestriction,
	type CommandRestriction
} from '#lib/structures/commands-menu/restrictions';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import { isDashboardAccessEntry, type PermissionsNode } from 'wolfstar-database';

/**
 * Why a legacy node was not converted, and stays for an administrator to decide.
 *
 * - `unknownCommand`: a name that is neither a command, a category, a sub-category nor `*` of the bot.
 * - `protectedCommand`: a name of a command that cannot be restricted (`settings`, `commands`, and `conf`, which the
 *   matchers read as `settings`).
 * - `meaningChanges`: an allowed name covers a denied one that is as specific or more: the node let the member in,
 *   since a node ran its allowed names first, while the most specific rule would keep them out.
 */
export type LegacyNodeSkip = 'unknownCommand' | 'protectedCommand' | 'meaningChanges';

export interface LegacyNodeConversion {
	/** The rules of the server, with the converted nodes in them. */
	restrictions: CommandRestriction[];
	/** What stays in `permissions.users`: the dashboard access rules and the nodes that were not converted. */
	users: PermissionsNode[];
	/** What stays in `permissions.roles`, the same way; the nodes of the roles that are gone are dropped. */
	roles: PermissionsNode[];
	skipped: { kind: 'user' | 'role'; node: PermissionsNode; reason: LegacyNodeSkip }[];
	/** How many names became an allowed entry, and how many an ignored one. */
	converted: { allow: number; deny: number };
}

export interface LegacyNodeConversionInput {
	users: readonly PermissionsNode[];
	roles: readonly PermissionsNode[];
	restrictions: readonly CommandRestriction[];
	/** The roles the guild has, so the nodes of a deleted role are dropped. */
	existingRoleIds: ReadonlySet<Snowflake>;
}

/**
 * Converts the legacy permission nodes of a server into command rules: a name a node allows puts the member or the role
 * in the allowed entries of the rule of that target, a name it denies in the ignored ones. A node is converted whole
 * or left whole, see {@linkcode LegacyNodeSkip}. Converting the result again changes nothing.
 *
 * @param input - The two columns of the nodes, the rules of the server and the roles it has.
 */
export function convertLegacyNodes(input: LegacyNodeConversionInput): LegacyNodeConversion {
	const result: LegacyNodeConversion = {
		restrictions: [...input.restrictions],
		users: [],
		roles: [],
		skipped: [],
		converted: { allow: 0, deny: 0 }
	};

	for (const kind of ['user', 'role'] as const) {
		const column = kind === 'user' ? input.users : input.roles;
		const kept = kind === 'user' ? result.users : result.roles;

		for (const node of column) {
			if (isDashboardAccessEntry(node)) {
				kept.push(node);
				continue;
			}

			if (kind === 'role' && !input.existingRoleIds.has(node.id)) continue;

			const targets = resolveNodeTargets(node);
			if (typeof targets === 'string') {
				kept.push(node);
				result.skipped.push({ kind, node, reason: targets });
				continue;
			}

			for (const [action, names] of [
				['allow', targets.allow],
				['deny', targets.deny]
			] as const) {
				for (const target of names) {
					result.restrictions = addToRule(result.restrictions, target, kind, action, node.id);
					result.converted[action]++;
				}
			}
		}
	}

	return result;
}

/**
 * The targets of a node, as the rules store them, or why it cannot be converted.
 */
function resolveNodeTargets(node: PermissionsNode): { allow: string[]; deny: string[] } | LegacyNodeSkip {
	const targets = { allow: [] as string[], deny: [] as string[] };
	for (const action of ['allow', 'deny'] as const) {
		for (const name of node[action]) {
			const target = resolve(name);
			if (target === null) return 'unknownCommand';
			if (ProtectedCommands.has(target)) return 'protectedCommand';
			targets[action].push(target);
		}
	}

	return changesMeaning(targets.allow, targets.deny) ? 'meaningChanges' : targets;
}

function changesMeaning(allowed: readonly string[], denied: readonly string[]): boolean {
	if (allowed.length === 0 || denied.length === 0) return false;

	const commands = [...container.stores.get('commands').values()];
	return allowed.some((allow) =>
		denied.some(
			(deny) =>
				getCommandRuleSpecificity(deny) >= getCommandRuleSpecificity(allow) &&
				commands.some((command) => match(allow, command) && match(deny, command))
		)
	);
}

function addToRule(
	restrictions: readonly CommandRestriction[],
	target: string,
	kind: 'user' | 'role',
	action: 'allow' | 'deny',
	id: Snowflake
): CommandRestriction[] {
	const rule = findCommandRestriction(restrictions, target);
	const list = `${action === 'allow' ? 'allowed' : 'ignored'}${kind === 'user' ? 'Users' : 'Roles'}` as const;
	return setCommandRestriction(restrictions, { ...rule, [list]: [...rule[list], id] });
}
