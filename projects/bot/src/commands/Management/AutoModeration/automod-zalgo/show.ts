import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationShowCommand } from '#lib/moderation/structures/AutoModerationShowCommand';

/**
 * `/automod-zalgo show`, see the `automod-zalgo` parent command.
 */
@AutoModerationShowCommand.register(AutoModerationRules.zalgo)
export class UserCommand extends AutoModerationShowCommand {}
