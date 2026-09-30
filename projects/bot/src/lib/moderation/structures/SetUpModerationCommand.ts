import { readSettings } from '#lib/database';
import type { RoleTypeVariation } from '#lib/moderation';
import { ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { CommandPermissionLevel, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { container } from '@wolfstar/http-framework';

/**
 * A moderation command that needs a role (the `mute` and `restrict` ones), which is set up when it is missing.
 *
 * @remarks
 *
 * The prefix command asked the author, through message prompts, whether to configure an existing role or to create a
 * new one. A slash command cannot wait for a message inside its handler, so when the role is missing:
 *
 * - an author that is not an administrator is told to ask one (`restrictLowlevel`), like before.
 * - an administrator gets a new role created, with the channel overrides applied, through
 *   {@linkcode RoleModerationAction.setup}. To use an existing role instead, configure it in the settings first.
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
		const role = roleId ? await container.gatewayClient.roles.get(context.guild.id, roleId) : undefined;
		if (role) return;

		if (!(await hasCommandPermissionLevel(interaction, CommandPermissionLevel.Administrator))) {
			throw context.t('commands/moderation:restrictLowlevel');
		}

		await this.action.setup({
			guild: context.guild,
			author: context.moderator,
			confirm: () => true
		});
	}
}

export namespace SetUpModerationCommand {
	export type Options<Type extends RoleTypeVariation> = ModerationCommand.Options<Type>;

	export type LoaderContext = ModerationCommand.LoaderContext;
	export type Interaction = ModerationCommand.Interaction;
	export type Arguments = ModerationCommand.Arguments;

	export type Parameters = ModerationCommand.Parameters;
	export type HandlerParameters<ValueType = null> = ModerationCommand.HandlerParameters<ValueType>;
	export type PostHandleParameters<ValueType = null> = ModerationCommand.PostHandleParameters<ValueType>;
}
