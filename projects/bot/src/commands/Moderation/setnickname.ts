import { applyModerationBuilder, ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import type { Command } from '@wolfstar/http-framework';
import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { PermissionFlagsBits } from 'discord-api-types/v10';

type Type = TypeVariation.SetNickname;
type ValueType = null;

/**
 * Sets, or resets when the `nickname` option is left out, the nickname of a member. Leaving the nickname out resets it
 * back to the username of the user.
 */
@RegisterCommand((builder) =>
	applyModerationBuilder(builder, {
		root: 'commands/moderation:setNickname',
		type: TypeVariation.SetNickname,
		permissions: PermissionFlagsBits.ManageNicknames,
		optionalOptions: (options) =>
			options.addStringOption((option) =>
				applyLocalizedBuilder(option, 'commands/moderation:setNicknameOptionsNickname').setMaxLength(32).setRequired(false)
			)
	})
)
export class UserCommand extends ModerationCommand<Type, ValueType> {
	public constructor(context: ModerationCommand.LoaderContext, options: ModerationCommand.Options<Type>) {
		super(context, { ...options, type: TypeVariation.SetNickname, requiredMember: true });
	}

	protected override getHandleDataContext(_interaction: ModerationCommand.Interaction, context: ModerationCommand.HandlerParameters<ValueType>) {
		return (context.args as Command.OptionsOf<'setnickname'>).nickname ?? null;
	}

	protected override getActionStatusKey(context: ModerationCommand.HandlerParameters<ValueType>) {
		return (context.args as Command.OptionsOf<'setnickname'>).nickname === undefined
			? 'moderation:actionIsNotActiveNickname'
			: 'moderation:actionIsActiveNickname';
	}
}
