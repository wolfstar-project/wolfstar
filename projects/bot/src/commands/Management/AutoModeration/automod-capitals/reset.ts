import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationResetCommand } from '#lib/moderation/structures/AutoModerationResetCommand';

/**
 * `/automod-capitals reset`, see the `automod-capitals` parent command.
 */
@AutoModerationResetCommand.register(AutoModerationRules.capitals)
export class UserCommand extends AutoModerationResetCommand {}
