import { CommandPermissionLevel } from '#lib/structures/commands/permissions';
import { PermissionLevelPrecondition } from '#lib/structures/commands/PermissionLevelPrecondition';

/**
 * Lets the moderators of the server run a command or use an interaction handler, see
 * {@linkcode CommandPermissionLevel.Moderator}.
 */
export class UserPrecondition extends PermissionLevelPrecondition {
	protected override readonly level = CommandPermissionLevel.Moderator;
}
