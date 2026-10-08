import { readSettings } from '#lib/database';
import { applyModerationBuilder, ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { getModeration } from '#utils/functions';
import { getSeconds } from '#utils/moderation-utilities';
import { TypeVariation, type Unlock } from '#utils/moderationConstants';
import { RegisterCommand, type Command } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { PermissionFlagsBits } from 'discord-api-types/v10';

type Type = TypeVariation.Softban;
type ValueType = Unlock | null;

/**
 * Bans and unbans a user right after, deleting up to 7 days of their messages.
 *
 * - The `delete-days` option sets how many days of messages are deleted, up to 7.
 * - `moderationTrackBans` replaces the `events.ban-add` and `events.ban-remove` settings, see the `ban` command.
 */
@RegisterCommand((builder) =>
	applyModerationBuilder(builder, {
		root: 'commands/moderation:softBan',
		type: TypeVariation.Softban,
		permissions: PermissionFlagsBits.BanMembers,
		optionalOptions: (options) =>
			options.addIntegerOption((option) =>
				applyLocalizedBuilder(option, 'commands/moderation:softBanOptionsDeleteDays').setMinValue(0).setMaxValue(7).setRequired(false)
			)
	})
)
export class UserCommand extends ModerationCommand<Type, ValueType> {
	public constructor(context: ModerationCommand.LoaderContext, options: ModerationCommand.Options<Type>) {
		super(context, { ...options, type: TypeVariation.Softban, requiredMember: false });
	}

	protected override async preHandle(interaction: ModerationCommand.Interaction, context: ModerationCommand.Parameters) {
		const settings = await readSettings(interaction.guildId);
		return settings.moderationTrackBans ? { unlock: (await getModeration(context.guild)).createLock() } : null;
	}

	protected override getHandleDataContext(_interaction: ModerationCommand.Interaction, context: ModerationCommand.HandlerParameters<ValueType>) {
		return getSeconds({ days: (context.args as Command.OptionsOf<'softban'>)['delete-days'] });
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
