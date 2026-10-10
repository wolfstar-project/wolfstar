import { readSettings } from '#lib/database';
import type { RoleTypeVariation } from '#lib/moderation';
import { ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { ModerationCommandPrompt, renderRoleSetupPrompt } from '#lib/moderation/structures/RoleSetupPrompt';
import { CommandPermissionLevel, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { container } from '@wolfstar/http-framework';

/**
 * A moderation command that needs a role (the `mute` and `restrict` ones), which is set up when it is missing.
 *
 * @remarks
 *
 * When the role is missing:
 *
 * - an author that is not an administrator is told to ask one (`restrictLowlevel`).
 * - an administrator is asked what to do, in a prompt: use a role the server has, picked in a select menu, or create a
 *   new one, which is also configured in every channel through {@linkcode RoleModerationAction.setup}. The `roleSetup`
 *   interaction handler does what is picked, see `RoleSetupPrompt.ts`.
 *
 * The command is not run after the prompt: a click only carries the ID of its component, not the options of the command,
 * so the administrator runs it again once the role is set up.
 */
export abstract class SetUpModerationCommand<Type extends RoleTypeVariation, ValueType> extends ModerationCommand<Type, ValueType> {
	public constructor(context: ModerationCommand.LoaderContext, options: SetUpModerationCommand.Options<Type>) {
		super(context, {
			requiredMember: true,
			actionStatusKey: options.isUndoAction ? 'moderation:actionIsNotActiveRestrictionRole' : 'moderation:actionIsActiveRestrictionRole',
			...options
		});
	}

	protected override async inhibit(interaction: ModerationCommand.Interaction, context: ModerationCommand.Parameters) {
		const settings = await readSettings(context.guild);
		const roleId = settings[this.action.roleKey];

		// Verify for role existence.
		const role = roleId
			? await container.gatewayClient.roles.cache.get(container.gatewayClient.roles.resolveKey(context.guild.id, roleId))
			: undefined;
		if (role) return;

		if (!(await hasCommandPermissionLevel(interaction, CommandPermissionLevel.Administrator))) {
			throw context.t('commands/moderation:restrictLowlevel');
		}

		throw new ModerationCommandPrompt(renderRoleSetupPrompt(context.t, interaction.user.id, this.action.type));
	}
}

export declare namespace SetUpModerationCommand {
	type Options<Type extends RoleTypeVariation> = ModerationCommand.Options<Type>;

	type LoaderContext = ModerationCommand.LoaderContext;
	type Interaction = ModerationCommand.Interaction;
	type Arguments = ModerationCommand.Arguments;

	type Parameters = ModerationCommand.Parameters;
	type HandlerParameters<ValueType = null> = ModerationCommand.HandlerParameters<ValueType>;
	type PostHandleParameters<ValueType = null> = ModerationCommand.PostHandleParameters<ValueType>;
}
