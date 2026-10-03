import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationResetCommand } from '#lib/moderation/structures/AutoModerationResetCommand';

/**
 * `/automod-links reset`, see the `automod-links` parent command.
 */
@AutoModerationResetCommand.register(AutoModerationRules.links)
export class UserCommand extends AutoModerationResetCommand {}
