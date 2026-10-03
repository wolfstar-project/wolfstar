import { createAutoModerationCommandBuilder } from '#lib/moderation/structures/AutoModerationCommand';
import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import { RegisterCommand } from '@wolfstar/http-framework';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * The parent of the `automod-newlines` subcommands, which are wired onto this command by
 * `@wolfstar/plugin-subcommands-advanced`, see the `automod-newlines` folder.
 */
@RegisterCommand(createAutoModerationCommandBuilder(AutoModerationRules.newlines))
export class UserCommand extends Subcommand {}
