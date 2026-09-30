import type { PermissionsNode, ReadonlyGuildData } from '#lib/database/settings/types';
import { matchAny } from '#lib/database/utils/matchers/Command';
import type { WolfCommand } from '#lib/structures';
import { container, UserError } from '@sapphire/framework';
import { Collection, Role, type GuildMember, type User } from 'discord.js';

export const enum PermissionNodeAction {
	Allow,
	Deny
}

type PermissionNodeValueResolvable = Role | GuildMember | User;

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

	public async run(member: GuildMember, command: WolfCommand) {
		// The role order comes from the guild's roles, which are fetched asynchronously:
		await this.#ready;
		return this.runUser(member, command) ?? this.runRole(member, command);
	}

	public has(roleId: string) {
		return this.sorted.has(roleId);
	}

	public add(target: PermissionNodeValueResolvable, command: string, action: PermissionNodeAction): readonly PermissionsNode[] {
		const nodes = this.#getPermissionNodes(target);

		const nodeIndex = nodes.findIndex((n) => n.id === target.id);
		if (nodeIndex === -1) {
			const node: PermissionsNode = {
				id: target.id,
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
			id: target.id,
			allow: action === PermissionNodeAction.Allow ? previous.allow.concat(command) : previous.allow,
			deny: action === PermissionNodeAction.Deny ? previous.deny.concat(command) : previous.deny
		};

		return nodes.with(nodeIndex, node);
	}

	public remove(target: PermissionNodeValueResolvable, command: string, action: PermissionNodeAction): readonly PermissionsNode[] {
		const nodes = this.#getPermissionNodes(target);

		const nodeIndex = nodes.findIndex((n) => n.id === target.id);
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
			id: target.id,
			allow: action === PermissionNodeAction.Allow ? previous.allow.toSpliced(commandIndex, 1) : previous.allow,
			deny: action === PermissionNodeAction.Deny ? previous.deny.toSpliced(commandIndex, 1) : previous.deny
		};

		return node.allow.length === 0 && node.deny.length === 0 //
			? nodes.toSpliced(nodeIndex, 1)
			: nodes.with(nodeIndex, node);
	}

	public reset(target: PermissionNodeValueResolvable): readonly PermissionsNode[] {
		const nodes = this.#getPermissionNodes(target);

		const nodeIndex = nodes.findIndex((n) => n.id === target.id);
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

		let copy: PermissionsNode[] | null = null;

		// Delete redundant entries
		for (const removedItem of pendingToRemove) {
			const removedIndex = nodes.findIndex((element) => element.id === removedItem);
			if (removedIndex !== -1) {
				copy ??= nodes.slice();
				copy.splice(removedIndex, 1);
			}
		}

		return copy ?? nodes;
	}

	private runUser(member: GuildMember, command: WolfCommand) {
		// Assume sorted data
		const permissionNodeRoles = this.#cachedRawPermissionUsers;
		const memberId = member.id;
		for (const node of permissionNodeRoles) {
			if (node.id !== memberId) continue;
			if (matchAny(node.allow, command)) return true;
			if (matchAny(node.deny, command)) return false;
		}

		return null;
	}

	private runRole(member: GuildMember, command: WolfCommand) {
		const roles = member.roles.cache;

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
			const node = nodes.find((node) => node.id === sortedRole.id);
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

	#getPermissionNodes(target: PermissionNodeValueResolvable): readonly PermissionsNode[] {
		return target instanceof Role ? this.#cachedRawPermissionRoles : this.#cachedRawPermissionUsers;
	}
}

interface PermissionsManagerNode {
	allow: Set<string>;
	deny: Set<string>;
}
