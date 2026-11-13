import { readSettings } from '#lib/database';
import { ModerationActions, SetUpModerationCommand } from '#lib/moderation';
import { isMuteTimeout } from '#lib/moderation/actions/mute';
import { applyModerationSubcommandBuilder } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.Mute;
type ValueType = null;

/**
 * `/mute add`, see the `mute` parent command. The mute is a Discord timeout instead of the muted role when the guild
 * set it up so, see {@linkcode isMuteTimeout}: it then needs no muted role, and its case is a Timeout.
 */
@ApplyOptions<SetUpModerationCommand.Options<Type>>({ type: TypeVariation.Mute })
@RegisterAsSubcommand('mute', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:muteAdd',
		type: TypeVariation.Mute
	})
)
export class UserSetUpModerationCommand extends SetUpModerationCommand<Type, ValueType> {
	protected override async inhibit(interaction: SetUpModerationCommand.Interaction, context: SetUpModerationCommand.Parameters) {
		if (await this.isTimeout(context)) return;
		await super.inhibit(interaction, context);
	}

	protected override async checkTargetCanBeModerated(
		interaction: SetUpModerationCommand.Interaction,
		context: SetUpModerationCommand.HandlerParameters<ValueType>
	) {
		const member = await super.checkTargetCanBeModerated(interaction, context);
		if (member && (await this.isTimeout(context)) && !(await member.moderatable)) {
			throw context.t('commands/moderation:timeoutNotModeratable');
		}
		return member;
	}

	protected override async handle(interaction: SetUpModerationCommand.Interaction, context: SetUpModerationCommand.HandlerParameters<ValueType>) {
		if (!(await this.isTimeout(context))) return super.handle(interaction, context);

		const action = ModerationActions.timeout;
		if (await action.isActive(context.guild, context.target.id)) throw context.t('moderation:actionIsActive');

		const data = await this.getActionData(interaction, context);
		const entry = await action.apply(
			context.guild,
			{
				user: context.target,
				moderator: context.moderator,
				reason: context.reason,
				messageReference: context.messageReference,
				duration: context.duration
			},
			data as never
		);
		context.directMessageUndelivered = data.directMessageUndelivered === true;
		return entry;
	}

	/**
	 * Whether this mute is a Discord timeout, after the settings of the guild and its duration.
	 */
	private async isTimeout(context: SetUpModerationCommand.Parameters) {
		const settings = await readSettings(context.guild);
		return isMuteTimeout(settings, context.duration);
	}
}
