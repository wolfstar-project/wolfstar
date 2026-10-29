import type { Command } from '@wolfstar/http-framework';
import { isDashboardAccessEntry, type PermissionsNode, type ReadonlyGuildData } from 'wolfstar-database';
import { matchAny } from '#lib/database/utils/matchers/Command';
import { Collection } from '@discordjs/collection';
import { container, UserError } from '@wolfstar/http-framework';
import { Role, type GuildMember, type User } from '@wolfstar/plugin-gateway';
import type { Snowflake } from 'discord-api-types/v10';

export const enum PermissionNodeAction {
	Allow,
	Deny
}

type PermissionNodeValueResolvable = Role | GuildMember | User;

/**
 * Who the nodes are run for: a member and the roles they hold.
 */
export interface PermissionNodeSubject {
	id: Snowflake;
	roleIds: readonly Snowflake[];
}

/**
 * Whether an entry is a legacy node. The columns also hold the dashboard access rules of wolfstar.rocks, which name no
 * command, and which the nodes neither run nor change: `canManageServerSettings` reads them.
 */
function isLegacyNode(entry: PermissionsNode): boolean {
	return !isDashboardAccessEntry(entry);
}

export class PermissionNodeManager {
	private sorted = new Collection<string, PermissionsManagerNode>();
	#cachedRawPermissionRoles: readonly PermissionsNode[] = [];
	#cachedRawPermissionUsers: readonly PermissionsNode[] = [];
	#generation = 0;
	#ready: Promise<void> = Promise.resolve();

	public constructor(settings: ReadonlyGuildData) {
		// The failure is already logged by `refresh`:
		this.refresh(settings).catch(() => null);
	}

	public settingsPropertyFor(target: PermissionNodeValueResolvable) {
		return (target instanceof Role ? 'permissionsRoles' : 'permissionsUsers') satisfies keyof ReadonlyGuildData;
	}

	public async run(subject: PermissionNodeSubject, command: Command) {
		// The role order comes from the guild's roles, which are fetched asynchronously:
		await this.#ready;
		return this.runUser(subject, command) ?? this.runRole(subject, command);
	}

	public has(roleId: string) {
		return this.sorted.has(roleId);
	}

	public add(target: PermissionNodeValueResolvable, command: string, action: PermissionNodeAction): readonly PermissionsNode[] {
		const nodes = this.#getPermissionNodes(target);
		const id = this.#getId(target);

		const nodeIndex = nodes.findIndex((n) => n.id === id && isLegacyNode(n));
		if (nodeIndex === -1) {
			const node: PermissionsNode = {
				id,
				allow: action === PermissionNodeAction.Allow ? [command] : [],
				deny: action === PermissionNodeAction.Deny ? [command] : []
			};

			return nodes.concat(node);
		}

		const previous = nodes[nodeIndex];
		if (
			(action === PermissionNodeAction.Allow && previous.allow.includes(command)) ||
			(action === PermissionNodeAction.Deny && previous.deny.includes(command))
		) {
			throw new UserError({ identifier: 'serializers:permissionNodeDuplicatedCommand', context: { command } });
		}

		const node: PermissionsNode = {
			id,
			allow: action === PermissionNodeAction.Allow ? previous.allow.concat(command) : previous.allow,
			deny: action === PermissionNodeAction.Deny ? previous.deny.concat(command) : previous.deny
		};

		return nodes.with(nodeIndex, node);
	}

	public remove(target: PermissionNodeValueResolvable, command: string, action: PermissionNodeAction): readonly PermissionsNode[] {
		const nodes = this.#getPermissionNodes(target);
		const id = this.#getId(target);

		const nodeIndex = nodes.findIndex((n) => n.id === id && isLegacyNode(n));
		if (nodeIndex === -1) {
			throw new UserError({ identifier: 'commands/management:permissionNodesNodeNotExists' });
		}

		const property = this.getName(action);
		const previous = nodes[nodeIndex];
		const commandIndex = previous[property].indexOf(command);
		if (commandIndex === -1) {
			throw new UserError({ identifier: 'commands/management:permissionNodesCommandNotExists' });
		}

		const node: PermissionsNode = {
			id,
			allow: action === PermissionNodeAction.Allow ? previous.allow.toSpliced(commandIndex, 1) : previous.allow,
			deny: action === PermissionNodeAction.Deny ? previous.deny.toSpliced(commandIndex, 1) : previous.deny
		};

		return node.allow.length === 0 && node.deny.length === 0 //
			? nodes.toSpliced(nodeIndex, 1)
			: nodes.with(nodeIndex, node);
	}

	public reset(target: PermissionNodeValueResolvable): readonly PermissionsNode[] {
		const nodes = this.#getPermissionNodes(target);
		const id = this.#getId(target);

		const nodeIndex = nodes.findIndex((n) => n.id === id && isLegacyNode(n));
		if (nodeIndex === -1) {
			throw new UserError({ identifier: 'commands/management:permissionNodesNodeNotExists', context: { target } });
		}

		return nodes.toSpliced(nodeIndex, 1);
	}

	/**
	 * Reads the permission nodes of the settings and sorts the role nodes by the position of their role, which needs the
	 * guild's roles, so it is asynchronous. {@link PermissionNodeManager.run} waits for the latest refresh.
	 * @returns The role nodes, without the ones whose role no longer exists.
	 */
	public refresh(settings: ReadonlyGuildData): Promise<readonly PermissionsNode[]> {
		this.#cachedRawPermissionRoles = settings.permissionsRoles;
		this.#cachedRawPermissionUsers = settings.permissionsUsers;

		const promise = this.#sort(settings, ++this.#generation);
		this.#ready = promise.then(
			() => undefined,
			(error: unknown) => container.logger.error(error)
		);

		return promise;
	}

	async #sort(settings: ReadonlyGuildData, generation: number): Promise<readonly PermissionsNode[]> {
		const nodes = settings.permissionsRoles;
		if (nodes.length === 0) {
			this.sorted.clear();
			return nodes;
		}

		// Generate sorted data and detect useless nodes to remove
		const { pendingToAdd, pendingToRemove } = await this.generateSorted(settings, nodes);

		// A newer refresh started while the roles were being fetched, its result wins:
		if (generation === this.#generation) {
			const sorted = new Collection<string, PermissionsManagerNode>();
			for (const pending of pendingToAdd) {
				sorted.set(pending.id, {
					allow: new Set(pending.allow),
					deny: new Set(pending.deny)
				});
			}

			this.sorted = sorted;
		}

		// The entries of a role that is gone are dropped, its dashboard access rule too: it can no longer name anybody.
		return pendingToRemove.size === 0 ? nodes : nodes.filter((entry) => !pendingToRemove.has(entry.id));
	}

	private runUser(subject: PermissionNodeSubject, command: Command) {
		for (const node of this.#cachedRawPermissionUsers) {
			if (node.id !== subject.id || !isLegacyNode(node)) continue;
			if (matchAny(node.allow, command)) return true;
			if (matchAny(node.deny, command)) return false;
		}

		return null;
	}

	private runRole(subject: PermissionNodeSubject, command: Command) {
		const roles = new Set(subject.roleIds);

		// Assume sorted data
		for (const [id, node] of this.sorted.entries()) {
			if (!roles.has(id)) continue;
			if (matchAny(node.allow, command)) return true;
			if (matchAny(node.deny, command)) return false;
		}

		return null;
	}

	private async generateSorted(settings: ReadonlyGuildData, nodes: readonly PermissionsNode[]) {
		const { pendingToRemove, sortedRoles } = await this.getSortedRoles(settings, nodes);

		const sortedNodes: PermissionsNode[] = [];
		for (const sortedRole of sortedRoles.values()) {
			const node = nodes.find((node) => node.id === sortedRole.id && isLegacyNode(node));
			if (node === undefined) continue;

			sortedNodes.push(node);
		}

		return {
			pendingToAdd: sortedNodes,
			pendingToRemove
		};
	}

	private async getSortedRoles(settings: ReadonlyGuildData, rawNodes: readonly PermissionsNode[]) {
		const ids = new Set(rawNodes.map((rawNode) => rawNode.id));

		// `fetchAll` returns the guild's roles highest first. Set#delete returns `true` when the entry exists, so it
		// sweeps the valid entries and leaves the ones whose role is gone in `ids`.
		const roles = await container.gatewayClient.roles.fetchAll(settings.id);
		const sortedRoles = roles.filter((role) => ids.delete(role.id));

		return { pendingToRemove: ids, sortedRoles };
	}

	private getName(type: PermissionNodeAction) {
		switch (type) {
			case PermissionNodeAction.Allow:
				return 'allow';
			case PermissionNodeAction.Deny:
				return 'deny';
			default:
				throw new Error('Unreachable');
		}
	}

	#getId(target: PermissionNodeValueResolvable): string {
		const { id } = target;
		if (id === null) throw new TypeError('The permission node target has no id.');
		return id;
	}

	#getPermissionNodes(target: PermissionNodeValueResolvable): readonly PermissionsNode[] {
		return target instanceof Role ? this.#cachedRawPermissionRoles : this.#cachedRawPermissionUsers;
	}
}

interface PermissionsManagerNode {
	allow: Set<string>;
	deny: Set<string>;
}
