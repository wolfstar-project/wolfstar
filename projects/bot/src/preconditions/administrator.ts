import { CommandPermissionLevel } from '#lib/structures/commands/permissions';
import { PermissionLevelPrecondition } from '#lib/structures/commands/PermissionLevelPrecondition';

/**
 * Lets the administrators of the server run a command or use an interaction handler, see
 * {@linkcode CommandPermissionLevel.Administrator}.
 */
export class UserPrecondition extends PermissionLevelPrecondition {
	protected override readonly level = CommandPermissionLevel.Administrator;
}
