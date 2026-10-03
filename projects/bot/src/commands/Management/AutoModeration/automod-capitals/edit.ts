import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationEditCommand } from '#lib/moderation/structures/AutoModerationEditCommand';

/**
 * `/automod-capitals edit`, see the `automod-capitals` parent command.
 */
@AutoModerationEditCommand.register(AutoModerationRules.capitals)
export class UserCommand extends AutoModerationEditCommand {}
