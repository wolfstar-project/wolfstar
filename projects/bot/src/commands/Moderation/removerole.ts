import { applyModerationBuilder, ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { TypeVariation } from '#utils/moderationConstants';
import { RegisterCommand, type TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

type Type = TypeVariation.RoleRemove;
type ValueType = null;

interface Arguments extends ModerationCommand.Arguments {
	role: TransformedArguments.Role;
}

/**
 * Removes a role from a user. The command requires the administrator level, like the prefix command did, and Discord hides it from members without
 * `Manage Server` by default.
 */
@RegisterCommand((builder) =>
	applyModerationBuilder(builder, {
		root: 'commands/moderation:removerole',
		type: TypeVariation.RoleRemove,
		permissions: PermissionFlagsBits.ManageGuild,
		requiredOptions: (options) =>
			options.addRoleOption((option) => applyLocalizedBuilder(option, 'commands/moderation:removeroleOptionsRole').setRequired(true))
	})
)
export class UserCommand extends ModerationCommand<Type, ValueType> {
	public constructor(context: ModerationCommand.LoaderContext, options: ModerationCommand.Options<Type>) {
		super(context, { ...options, type: TypeVariation.RoleRemove, requiredMember: true, actionStatusKey: 'moderation:actionIsNotActiveRole' });
	}

	public override async chatInputRun(interaction: ModerationCommand.Interaction, args: Arguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		return super.chatInputRun(interaction, args);
	}

	protected override getHandleDataContext(_interaction: ModerationCommand.Interaction, context: ModerationCommand.HandlerParameters<ValueType>) {
		return { id: (context.args as Arguments).role.id };
	}
}
