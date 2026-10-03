import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationEditCommand } from '#lib/moderation/structures/AutoModerationEditCommand';

/**
 * `/automod-words edit`, see the `automod-words` parent command.
 */
@AutoModerationEditCommand.register(AutoModerationRules.words)
export class UserCommand extends AutoModerationEditCommand {}
