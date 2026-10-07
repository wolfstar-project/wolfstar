import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationResetCommand } from '#lib/moderation/structures/AutoModerationResetCommand';

/**
 * `/automod-zalgo reset`, see the `automod-zalgo` parent command.
 */
@AutoModerationResetCommand.register(AutoModerationRules.zalgo)
export class UserCommand extends AutoModerationResetCommand {}
