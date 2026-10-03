import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationShowCommand } from '#lib/moderation/structures/AutoModerationShowCommand';

/**
 * `/automod-newlines show`, see the `automod-newlines` parent command.
 */
@AutoModerationShowCommand.register(AutoModerationRules.newlines)
export class UserCommand extends AutoModerationShowCommand {}
