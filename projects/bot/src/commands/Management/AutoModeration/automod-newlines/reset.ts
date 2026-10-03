import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationResetCommand } from '#lib/moderation/structures/AutoModerationResetCommand';

/**
 * `/automod-newlines reset`, see the `automod-newlines` parent command.
 */
@AutoModerationResetCommand.register(AutoModerationRules.newlines)
export class UserCommand extends AutoModerationResetCommand {}
