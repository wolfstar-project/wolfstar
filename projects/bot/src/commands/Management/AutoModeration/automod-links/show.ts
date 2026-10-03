import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationShowCommand } from '#lib/moderation/structures/AutoModerationShowCommand';

/**
 * `/automod-links show`, see the `automod-links` parent command.
 */
@AutoModerationShowCommand.register(AutoModerationRules.links)
export class UserCommand extends AutoModerationShowCommand {}
