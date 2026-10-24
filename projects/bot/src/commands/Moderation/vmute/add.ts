import { ModerationCommand } from '#lib/moderation';
import { applyModerationSubcommandBuilder } from '#lib/moderation/structures/ModerationCommand';
import { TypeVariation } from '#utils/moderationConstants';
import { ApplyOptions } from '@wolfstar/decorators';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

type Type = TypeVariation.VoiceMute;
type ValueType = null;

/**
 * `/vmute add`, see the `vmute` parent command.
 */
@ApplyOptions<ModerationCommand.Options<Type>>({ requiredMember: true, type: TypeVariation.VoiceMute })
@RegisterAsSubcommand('vmute', (builder) =>
	applyModerationSubcommandBuilder(builder, {
		root: 'commands/moderation:vmuteAdd',
		type: TypeVariation.VoiceMute
	})
)
export class UserModerationCommand extends ModerationCommand<Type, ValueType> {}
