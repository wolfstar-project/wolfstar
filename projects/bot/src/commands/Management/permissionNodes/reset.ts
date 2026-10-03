import { readSettingsPermissionNodes, writeSettingsTransaction } from '#lib/database';
import {
	PermissionNodesRoot,
	checkPermissions,
	replyWithPermissionNodeResult,
	resolveTarget,
	type PermissionNodeTargetOptions
} from '#lib/structures/commands/permissionNodes';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { UserError } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/permission-nodes reset`, see the `permission-nodes` parent command.
 */
@RegisterAsSubcommand('permission-nodes', (builder) =>
	applyLocalizedBuilder(builder, `${PermissionNodesRoot}:permissionNodesSubcommandReset`) //
		.addMentionableOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsTarget').setRequired(true))
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override chatInputRun(interaction: GuildChatInputInteraction, options: PermissionNodeTargetOptions) {
		return replyWithPermissionNodeResult(interaction, async (t) => {
			const target = await resolveTarget(interaction, options.target);

			if (!(await checkPermissions(interaction, target))) throw new UserError({ identifier: `${PermissionNodesRoot}:permissionNodesHigher` });

			using trx = await writeSettingsTransaction(interaction.guildId);
			const nodes = readSettingsPermissionNodes(trx.settings);
			const propertyKey = nodes.settingsPropertyFor(target);
			await trx.write({ [propertyKey]: nodes.reset(target) }).submitWithAudit(interaction.user.id);

			return translateKey(t, `${PermissionNodesRoot}:permissionNodesReset`);
		});
	}
}
