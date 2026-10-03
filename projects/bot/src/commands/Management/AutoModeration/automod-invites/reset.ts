import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationResetCommand } from '#lib/moderation/structures/AutoModerationResetCommand';

/**
 * `/automod-invites reset`, see the `automod-invites` parent command.
 */
@AutoModerationResetCommand.register(AutoModerationRules.invites)
export class UserCommand extends AutoModerationResetCommand {}
