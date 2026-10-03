import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { AutoModerationResetCommand } from '#lib/moderation/structures/AutoModerationResetCommand';

/**
 * `/automod-attachments reset`, see the `automod-attachments` parent command.
 */
@AutoModerationResetCommand.register(AutoModerationRules.attachments)
export class UserCommand extends AutoModerationResetCommand {}
