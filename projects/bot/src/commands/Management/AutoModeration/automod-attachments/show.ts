import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationShowCommand } from '#lib/moderation/structures/AutoModerationShowCommand';

/**
 * `/automod-attachments show`, see the `automod-attachments` parent command.
 */
@AutoModerationShowCommand.register(AutoModerationRules.attachments)
export class UserCommand extends AutoModerationShowCommand {}
