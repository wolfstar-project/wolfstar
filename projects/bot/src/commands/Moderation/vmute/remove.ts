import { ModerationCommand } from '#lib/moderation';
import { applyModerationSubcommandBuilder } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.VoiceMute;
type ValueType = null;

/**
 * `/vmute remove`, see the `vmute` parent command.
 */
@ApplyOptions<ModerationCommand.Options<Type>>({ requiredMember: true, isUndoAction: true, type: TypeVariation.VoiceMute })
@RegisterAsSubcommand('vmute', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:vmuteRemove',
		type: TypeVariation.VoiceMute,
		isUndoAction: true
	})
)
export class UserModerationCommand extends ModerationCommand<Type, ValueType> {}
