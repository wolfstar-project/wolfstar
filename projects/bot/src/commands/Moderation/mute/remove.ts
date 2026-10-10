import { SetUpModerationCommand } from '#lib/moderation';
import { applyModerationSubcommandBuilder } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.Mute;
type ValueType = null;

/**
 * `/mute remove`, see the `mute` parent command.
 */
@ApplyOptions<SetUpModerationCommand.Options<Type>>({ type: TypeVariation.Mute, isUndoAction: true })
@RegisterAsSubcommand('mute', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:muteRemove',
		type: TypeVariation.Mute,
		isUndoAction: true
	})
)
export class UserSetUpModerationCommand extends SetUpModerationCommand<Type, ValueType> {}
