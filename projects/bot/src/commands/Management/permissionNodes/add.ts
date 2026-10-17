import { CommandMatcher, readSettingsPermissionNodes, writeSettingsTransaction } from '#lib/database';
import {
	PermissionNodesRoot,
	applyAddOrRemove,
	checkPermissions,
	replyWithPermissionNodeResult,
	resolveTarget,
	toPermissionNodeAction
} from '#lib/structures/commands/permissionNodes';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { UserError } from '@wolfstar/http-framework';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/permission-nodes add`, see the `permission-nodes` parent command.
 */
@RegisterAsSubcommand('permission-nodes', (builder) => applyAddOrRemove(builder, 'Add'))
export class UserCommand extends Command {
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'permission-nodes add'>) {
		return replyWithPermissionNodeResult(interaction, async (t) => {
			const target = await resolveTarget(interaction, options.target);
			const action = toPermissionNodeAction(options.type);

			// Permission Nodes do not allow allows for the @everyone role:
			if (target.id === interaction.guildId && options.type === 'allow') {
				throw new UserError({ identifier: `${PermissionNodesRoot}:permissionNodesCannotAllowEveryone` });
			}

			if (!(await checkPermissions(interaction, target))) throw new UserError({ identifier: `${PermissionNodesRoot}:permissionNodesHigher` });

			const command = CommandMatcher.resolve(options.command);
			if (command === null)
				throw new UserError({ identifier: `${PermissionNodesRoot}:permissionNodesCommandInvalid`, context: { command: options.command } });

			using trx = await writeSettingsTransaction(interaction.guildId);
			const nodes = readSettingsPermissionNodes(trx.settings);
			const propertyKey = nodes.settingsPropertyFor(target);
			await trx.write({ [propertyKey]: nodes.add(target, command, action) }).submitWithAudit(interaction.user.id);

			return translateKey(t, `${PermissionNodesRoot}:permissionNodesAdd`);
		});
	}
}
