import { applyModerationBuilder, ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import type { Command } from '@wolfstar/http-framework';
import { container, RegisterCommand } from '@wolfstar/http-framework';
import { deleteStickyNickname, fetchStickyNickname, setStickyNickname } from 'wolfstar-database';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { PermissionFlagsBits } from 'discord-api-types/v10';

type Type = TypeVariation.SetNickname;
type ValueType = null;

/**
 * Sets, or resets when the `nickname` option is left out, the nickname of a member. Leaving the nickname out resets it
 * back to the username of the user.
 *
 * @remarks
 *
 * With the `sticky` option the nickname is kept, and set again when the member joins the server back. Only a moderator
 * removes it: resetting the nickname, or setting another one that is not sticky, drops it.
 */
@RegisterCommand((builder) =>
	applyModerationBuilder(builder, {
		root: 'commands/moderation:setNickname',
		type: TypeVariation.SetNickname,
		permissions: PermissionFlagsBits.ManageNicknames,
		optionalOptions: (options) =>
			options
				.addStringOption((option) =>
					applyLocalizedBuilder(option, 'commands/moderation:setNicknameOptionsNickname').setMaxLength(32).setRequired(false)
				)
				.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/moderation:setNicknameOptionsSticky').setRequired(false))
	})
)
export class UserCommand extends ModerationCommand<Type, ValueType> {
	public constructor(context: ModerationCommand.LoaderContext, options: ModerationCommand.Options<Type>) {
		super(context, { ...options, type: TypeVariation.SetNickname, requiredMember: true });
	}

	protected override async handle(interaction: ModerationCommand.Interaction, context: ModerationCommand.HandlerParameters<ValueType>) {
		const { nickname, sticky } = context.args as Command.OptionsOf<'setnickname'>;
		const { guild, target } = context;

		// A reset unsticks the nickname even when the member has none right now, which would make the action fail:
		if (nickname === undefined) {
			await deleteStickyNickname(container.prisma, guild.id, target.id);
			return super.handle(interaction, context);
		}

		// The sticky nickname is written before Discord is asked, so a database that fails leaves the nickname of the
		// member as it was, and it is put back as it was when Discord refuses the change:
		const previous = await fetchStickyNickname(container.prisma, guild.id, target.id);
		if (sticky) await setStickyNickname(container.prisma, guild.id, target.id, nickname);
		else if (previous !== null) await deleteStickyNickname(container.prisma, guild.id, target.id);

		try {
			return await super.handle(interaction, context);
		} catch (error) {
			await this.restoreStickyNickname(guild.id, target.id, previous);
			throw error;
		}
	}

	private async restoreStickyNickname(guildId: string, userId: string, previous: string | null) {
		try {
			if (previous === null) await deleteStickyNickname(container.prisma, guildId, userId);
			else await setStickyNickname(container.prisma, guildId, userId, previous);
		} catch (error) {
			container.logger.error('Could not put the sticky nickname back after a nickname change failed:', error);
		}
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
