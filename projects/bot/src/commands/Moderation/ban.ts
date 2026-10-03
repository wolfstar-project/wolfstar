import { readSettings } from '#lib/database';
import { applyModerationBuilder, ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { getModeration } from '#utils/functions';
import { getSeconds } from '#utils/moderation-utilities';
import { TypeVariation, type Unlock } from '#utils/moderationConstants';
import { RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { PermissionFlagsBits } from 'discord-api-types/v10';

type Type = TypeVariation.Ban;
type ValueType = Unlock | null;

/**
 * Bans a user, optionally scheduling the unban and deleting up to 7 days of their messages.
 *
 * - The `delete-days` option replaces the `--seconds`, `--minutes`, `--hours` and `--days` flags of the prefix command.
 * - `moderationTrackBans` replaces the `events.ban-add` setting: when enabled, the ban listener creates a case for the
 *   bans that were not made with the bot, so the command holds a lock until its own case exists.
 */
@RegisterCommand((builder) =>
	applyModerationBuilder(builder, {
		root: 'commands/moderation:ban',
		type: TypeVariation.Ban,
		permissions: PermissionFlagsBits.BanMembers,
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
		if (member && !(await member.fetchBannable())) throw context.t('commands/moderation:banNotBannable');
		return member;
	}
}
