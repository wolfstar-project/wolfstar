import { applyModerationSubcommandBuilder, ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { TypeVariation } from '#utils/moderationConstants';
import type { CommandOptionsRegistry } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

type Type = TypeVariation.RoleAdd;
type ValueType = null;

/**
 * `/role add`, see the `role` parent command. Adds a role to a user. The command requires the administrator level.
 */
@RegisterAsSubcommand('role', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:roleAdd',
		type: TypeVariation.RoleAdd,
		requiredOptions: (options) =>
			options.addRoleOption((option) => applyLocalizedBuilder(option, 'commands/moderation:addRoleOptionsRole').setRequired(true))
	})
)
export class UserCommand extends ModerationCommand<Type, ValueType> {
	public constructor(context: ModerationCommand.LoaderContext, options: ModerationCommand.Options<Type>) {
		super(context, { ...options, type: TypeVariation.RoleAdd, requiredMember: true, actionStatusKey: 'moderation:actionIsActiveRole' });
	}

	public override async chatInputRun(interaction: ModerationCommand.Interaction, args: CommandOptionsRegistry['role add']) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		return super.chatInputRun(interaction, args);
	}

	protected override getHandleDataContext(_interaction: ModerationCommand.Interaction, context: ModerationCommand.HandlerParameters<ValueType>) {
		return { id: (context.args as CommandOptionsRegistry['role add']).role.id };
	}
}
