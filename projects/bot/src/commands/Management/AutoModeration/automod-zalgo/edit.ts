import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationEditCommand } from '#lib/moderation/structures/AutoModerationEditCommand';

/**
 * `/automod-zalgo edit`, see the `automod-zalgo` parent command.
 */
@AutoModerationEditCommand.register(AutoModerationRules.zalgo)
export class UserCommand extends AutoModerationEditCommand {}
