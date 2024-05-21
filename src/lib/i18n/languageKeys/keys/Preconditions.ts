import { FT, T } from '#lib/types';
import type { Command } from '@sapphire/framework';
import type { ChannelType } from 'discord.js';

// Sapphire built-in:
export const ClientPermissions = FT<{ missing: string[] }>('preconditions:clientPermissions');
export const ClientPermissionsNoClient = T('preconditions:clientPermissionsNoClient');
export const ClientPermissionsNoPermissions = T('preconditions:clientPermissionsNoPermissions');
export const RunIn = FT<{ types: ChannelType[] }>('preconditions:runIn');
export const UserPermissionsNoPermissions = T('preconditions:userPermissionsNoPermissions');
export const Unavailable = T('preconditions:unavailable');
export const Cooldown = FT<{ remaining: number }>('preconditions:cooldown');
export const DisabledGlobal = T('preconditions:disabledGlobal');
export const Nsfw = T('preconditions:nsfw');
export const UserPermissions = FT<{ missing: string[] }>('preconditions:userPermissions');
export const MissingMessageHandler = T('preconditions:missingMessageHandler');
export const MissingChatInputHandler = T('preconditions:missingChatInputHandler');
export const MissingContextMenuHandler = T('preconditions:missingContextMenuHandler');

// Sapphire built-in (deprecated):
/** @deprecated */
export const DmOnly = T('preconditions:dmOnly');
/** @deprecated */
export const GuildNewsOnly = T('preconditions:guildNewsOnly');
/** @deprecated */
export const GuildNewsThreadOnly = T('preconditions:guildNewsThreadOnly');
/** @deprecated */
export const GuildOnly = T('preconditions:guildOnly');
/** @deprecated */
export const GuildPrivateThreadOnly = T('preconditions:guildPrivateThreadOnly');
/** @deprecated */
export const GuildPublicThreadOnly = T('preconditions:guildPublicThreadOnly');
/** @deprecated */
export const GuildTextOnly = T('preconditions:guildTextOnly');
/** @deprecated */
export const ThreadOnly = T('preconditions:threadOnly');

// Wolf:
export const Administrator = FT<{ command: Command }>('preconditions:administrator');
export const Moderator = FT<{ command: Command }>('preconditions:moderator');
export const NewsOnly = T('preconditions:newsOnly');
export const PermissionNodes = T('preconditions:permissionNodes');
export const ServerOwner = FT<{ command: Command }>('preconditions:serverOwner');
export const TextOnly = T('preconditions:textOnly');
