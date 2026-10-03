import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationEditCommand } from '#lib/moderation/structures/AutoModerationEditCommand';

/**
 * `/automod-attachments edit`, see the `automod-attachments` parent command.
 */
@AutoModerationEditCommand.register(AutoModerationRules.attachments)
export class UserCommand extends AutoModerationEditCommand {}
