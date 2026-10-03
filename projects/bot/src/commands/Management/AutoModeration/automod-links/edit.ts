import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationEditCommand } from '#lib/moderation/structures/AutoModerationEditCommand';

/**
 * `/automod-links edit`, see the `automod-links` parent command.
 */
@AutoModerationEditCommand.register(AutoModerationRules.links)
export class UserCommand extends AutoModerationEditCommand {}
