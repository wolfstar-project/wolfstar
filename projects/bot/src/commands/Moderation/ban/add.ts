import { readSettings } from '#lib/database';
import { applyModerationSubcommandBuilder, ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { getModeration } from '#utils/functions';
import { getSeconds } from '#utils/moderation-utilities';
import { TypeVariation, type Unlock } from '#utils/moderationConstants';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.Ban;
type ValueType = Unlock | null;

/**
 * `/ban add`, see the `ban` parent command. Bans a user, optionally scheduling the unban and deleting up to 7 days of their messages.
 *
 * - The `delete-days` option sets how many days of messages are deleted, up to 7.
 * - `moderationTrackBans` replaces the `events.ban-add` setting: when enabled, the ban listener creates a case for the
 *   bans that were not made with the bot, so the command holds a lock until its own case exists.
 */
@RegisterAsSubcommand('ban', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:banAdd',
		type: TypeVariation.Ban,
		optionalOptions: (options) =>
			options.addIntegerOption((option) =>
				applyLocalizedBuilder(option, 'commands/moderation:banOptionsDeleteDays').setMinValue(0).setMaxValue(7).setRequired(false)
			)
	})
)
export class UserCommand extends ModerationCommand<Type, ValueType> {
	public constructor(context: ModerationCommand.LoaderContext, options: ModerationCommand.Options<Type>) {
		super(context, { ...options, type: TypeVariation.Ban });
	}

	protected override async preHandle(interaction: ModerationCommand.Interaction, context: ModerationCommand.Parameters) {
		const settings = await readSettings(interaction.guildId);
		return settings.moderationTrackBans ? { unlock: (await getModeration(context.guild)).createLock() } : null;
	}

	protected override getHandleDataContext(_interaction: ModerationCommand.Interaction, context: ModerationCommand.HandlerParameters<ValueType>) {
		return getSeconds({ days: (context.args as ModerationCommand.Arguments & { 'delete-days'?: number })['delete-days'] });
	}

	protected override postHandle(_interaction: ModerationCommand.Interaction, { preHandled }: ModerationCommand.PostHandleParameters<ValueType>) {
		preHandled?.unlock();
	}

	protected override async checkTargetCanBeModerated(
		interaction: ModerationCommand.Interaction,
		context: ModerationCommand.HandlerParameters<ValueType>
	) {
		const member = await super.checkTargetCanBeModerated(interaction, context);
		if (member && !(await member.bannable)) throw context.t('commands/moderation:banNotBannable');
		return member;
	}
}
