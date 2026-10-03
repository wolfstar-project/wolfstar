import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationShowCommand } from '#lib/moderation/structures/AutoModerationShowCommand';

/**
 * `/automod-invites show`, see the `automod-invites` parent command.
 */
@AutoModerationShowCommand.register(AutoModerationRules.invites)
export class UserCommand extends AutoModerationShowCommand {}
