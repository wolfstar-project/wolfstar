import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationEditCommand } from '#lib/moderation/structures/AutoModerationEditCommand';

/**
 * `/automod-newlines edit`, see the `automod-newlines` parent command.
 */
@AutoModerationEditCommand.register(AutoModerationRules.newlines)
export class UserCommand extends AutoModerationEditCommand {}
