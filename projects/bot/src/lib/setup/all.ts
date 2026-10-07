import { envParseString } from '@wolfstar/env-utilities';
import { initializeSentry, setInvite, setRepository } from '@wolfstar/shared-http-pieces';
import { PermissionFlagsBits } from 'discord-api-types/v10';
import '#lib/setup/prisma';
import '#lib/setup/redis';
import '#lib/setup/serializers';
import '@wolfstar/shared-http-pieces/register';
// Registers the handlers of the prompts and the paginated messages, the Stars CLI only does it for the plugins:
import '@wolfstar/http-framework-utilities/register';

/**
 * The permissions the bot uses, which the invite link asks for. A permission that is not here makes the feature that
 * needs it answer with a missing permission error, and one that is not used is not asked for.
 *
 * - Messages: `ViewChannel`, `SendMessages`, `SendMessagesInThreads`, `EmbedLinks` and `AttachFiles` for the logs and the
 *   alerts of the auto-moderation, `ReadMessageHistory` for the reaction notifications, `UseExternalEmojis` for the
 *   emojis of the replies, and `ManageMessages` to delete the messages the auto-moderation catches and for `/prune`.
 * - Moderation: `KickMembers`, `BanMembers` (also `/softban`), `ModerateMembers` (timeouts), `MuteMembers` and
 *   `DeafenMembers` (voice mutes), `MoveMembers` (voice kicks), `ManageNicknames` (`/setnickname`, `/dehoist`), and `ManageRoles` (the
 *   restriction roles, the initial roles, `/role`, and the edits of the channel overwrites).
 * - Overwrites: a bot cannot allow or deny in a channel what it does not have there, and the restrictions and
 *   `/lockdown` deny `AddReactions`, `UseExternalEmojis`, `UseExternalStickers`, `UseApplicationCommands`,
 *   `CreatePublicThreads`, `CreatePrivateThreads`, `SendMessagesInThreads` and `Connect`. `ManageChannels` is for
 *   `/slowmode` and for the overwrites of the channels, `ManageThreads` for `/lockdown` on threads.
 * - `ViewAuditLog` for the logs that say who did what.
 */
const InvitePermissions =
	PermissionFlagsBits.ViewChannel |
	PermissionFlagsBits.SendMessages |
	PermissionFlagsBits.SendMessagesInThreads |
	PermissionFlagsBits.EmbedLinks |
	PermissionFlagsBits.AttachFiles |
	PermissionFlagsBits.ReadMessageHistory |
	PermissionFlagsBits.AddReactions |
	PermissionFlagsBits.UseExternalEmojis |
	PermissionFlagsBits.UseExternalStickers |
	PermissionFlagsBits.UseApplicationCommands |
	PermissionFlagsBits.CreatePublicThreads |
	PermissionFlagsBits.CreatePrivateThreads |
	PermissionFlagsBits.Connect |
	PermissionFlagsBits.ManageMessages |
	PermissionFlagsBits.ManageRoles |
	PermissionFlagsBits.ManageChannels |
	PermissionFlagsBits.ManageThreads |
	PermissionFlagsBits.ManageNicknames |
	PermissionFlagsBits.KickMembers |
	PermissionFlagsBits.BanMembers |
	PermissionFlagsBits.ModerateMembers |
	PermissionFlagsBits.MuteMembers |
	PermissionFlagsBits.DeafenMembers |
	PermissionFlagsBits.MoveMembers |
	PermissionFlagsBits.ViewAuditLog;

export function initializeApp() {
	setRepository('wolfstar');
	setInvite(envParseString('CLIENT_ID'), InvitePermissions.toString());
	// Reports the errors to Sentry when `SENTRY_DSN` is set:
	initializeSentry({ root: new URL('../../..', import.meta.url) });
}
