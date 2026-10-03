import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationShowCommand } from '#lib/moderation/structures/AutoModerationShowCommand';

/**
 * `/automod-capitals show`, see the `automod-capitals` parent command.
 */
@AutoModerationShowCommand.register(AutoModerationRules.capitals)
export class UserCommand extends AutoModerationShowCommand {}
