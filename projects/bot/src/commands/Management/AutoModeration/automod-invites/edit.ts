import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationEditCommand } from '#lib/moderation/structures/AutoModerationEditCommand';

/**
 * `/automod-invites edit`, see the `automod-invites` parent command.
 */
@AutoModerationEditCommand.register(AutoModerationRules.invites)
export class UserCommand extends AutoModerationEditCommand {}
