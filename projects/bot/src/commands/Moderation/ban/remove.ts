import { readSettings } from '#lib/database';
import { applyModerationSubcommandBuilder, ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { getModeration } from '#utils/functions';
import { TypeVariation, type Unlock } from '#utils/moderationConstants';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.Ban;
type ValueType = Unlock | null;

/**
 * `/ban remove`, see the `ban` parent command. Unbans a user. `moderationTrackBans` replaces the `events.ban-remove` setting, see `/ban add`.
 */
@RegisterAsSubcommand('ban', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:banRemove',
		type: TypeVariation.Ban,
		isUndoAction: true
	})
)
export class UserCommand extends ModerationCommand<Type, ValueType> {
	public constructor(context: ModerationCommand.LoaderContext, options: ModerationCommand.Options<Type>) {
		super(context, { ...options, type: TypeVariation.Ban, isUndoAction: true, requiredMember: false });
	}

	protected override async preHandle(interaction: ModerationCommand.Interaction, context: ModerationCommand.Parameters) {
		const settings = await readSettings(interaction.guildId);
		return settings.moderationTrackBans ? { unlock: (await getModeration(context.guild)).createLock() } : null;
	}

	protected override postHandle(_interaction: ModerationCommand.Interaction, { preHandled }: ModerationCommand.PostHandleParameters<ValueType>) {
		preHandled?.unlock();
	}
}
