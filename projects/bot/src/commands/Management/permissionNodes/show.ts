import { readSettings, type PermissionsNode } from '#lib/database';
import {
	PermissionNodesRoot,
	checkPermissions,
	replyWithPermissionNodeResult,
	resolveTarget,
	type PermissionNodeTarget,
	type PermissionNodeTargetOptions
} from '#lib/structures/commands/permissionNodes';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { resolveOnErrorCodes } from '#utils/common';
import { isNullish } from '@sapphire/utilities';
import { UserError } from '@wolfstar/http-framework';
import { Role } from '@wolfstar/plugin-gateway';
import { applyLocalizedBuilder, type TFunction } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';

const MaximumContentLength = 2000;

/**
 * `/permission-nodes show`, see the `permission-nodes` parent command.
 *
 * Lists every node when it has no `target`.
 */
@RegisterAsSubcommand('permission-nodes', (builder) =>
	applyLocalizedBuilder(builder, `${PermissionNodesRoot}:permissionNodesSubcommandShow`) //
		.addMentionableOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsTarget').setRequired(false))
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Partial<PermissionNodeTargetOptions>) {
		return replyWithPermissionNodeResult(interaction, async (t) => {
			const content = options.target //
				? await this.#showOne(interaction, t, options.target)
				: await this.#showAll(interaction, t);
			return content.slice(0, MaximumContentLength);
		});
	}

	async #showOne(interaction: GuildChatInputInteraction, t: TFunction, mentionable: NonNullable<PermissionNodeTargetOptions['target']>) {
		const target = await resolveTarget(interaction, mentionable);
		if (!(await checkPermissions(interaction, target))) throw new UserError({ identifier: `${PermissionNodesRoot}:permissionNodesHigher` });
		const isRole = target instanceof Role;

		const settings = await readSettings(interaction.guildId);
		const nodes = isRole ? settings.permissionsRoles : settings.permissionsUsers;
		const node = nodes.find((n) => n.id === target.id);
		if (node === undefined) throw new UserError({ identifier: `${PermissionNodesRoot}:permissionNodesNodeNotExists` });

		return this.#formatPermissionNode(t, node, target);
	}

	async #showAll(interaction: GuildChatInputInteraction, t: TFunction) {
		const settings = await readSettings(interaction.guildId);
		const [users, roles] = await Promise.all([
			this.#formatPermissionNodes(interaction, t, settings.permissionsUsers, false),
			this.#formatPermissionNodes(interaction, t, settings.permissionsRoles, true)
		]);
		const total = users.concat(roles);
		if (total.length === 0) throw new UserError({ identifier: `${PermissionNodesRoot}:permissionNodesNodeNotExists` });

		return total.join('\n\n');
	}

	async #formatPermissionNodes(interaction: GuildChatInputInteraction, t: TFunction, nodes: readonly PermissionsNode[], isRole: boolean) {
		const { gatewayClient } = this.container;
		const roles = isRole ? await gatewayClient.roles.fetchAll(interaction.guildId) : [];

		const output: string[] = [];
		for (const node of nodes) {
			const target = isRole
				? roles.find((role) => role.id === node.id)
				: await resolveOnErrorCodes(gatewayClient.members.fetch(interaction.guildId, node.id), RESTJSONErrorCodes.UnknownMember);

			if (isNullish(target)) continue;
			if (!(await checkPermissions(interaction, target))) continue;
			output.push(`> ${this.#formatPermissionNode(t, node, target)}`);
		}

		return output;
	}

	#formatPermissionNode(t: TFunction, node: PermissionsNode, target: PermissionNodeTarget) {
		return [
			translateKey(t, `${PermissionNodesRoot}:permissionNodesShowName`, { name: this.#formatTarget(target) }),
			translateKey(t, `${PermissionNodesRoot}:permissionNodesShowAllow`, { allow: this.#formatCommands(t, node.allow) }),
			translateKey(t, `${PermissionNodesRoot}:permissionNodesShowDeny`, { deny: this.#formatCommands(t, node.deny) })
		].join('\n');
	}

	#formatTarget(target: PermissionNodeTarget) {
		return target instanceof Role ? target.name : (target.displayName ?? target.user?.username ?? target.id);
	}

	#formatCommands(t: TFunction, commands: readonly string[]) {
		return commands.length === 0
			? translateKey(t, 'globals:none')
			: translateKey(t, 'globals:andListValue', { value: commands.map((command) => `\`${command}\``) });
	}
}
