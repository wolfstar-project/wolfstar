import { readSettings } from '#lib/database';
import { type ReadonlyGuildData } from 'wolfstar-database';
import { OWNERS } from '#root/config';
import type { GuildMember } from '@wolfstar/plugin-gateway';
import { PermissionFlagsBits } from 'discord-api-types/v10';

export async function isModerator(member: GuildMember) {
	if (isGuildOwner(member)) return true;

	const settings = await readSettings(member.guildId);
	return (await checkModerator(member, settings)) || (await checkAdministrator(member, settings));
}

export async function isAdmin(member: GuildMember) {
	if (isGuildOwner(member)) return true;

	const settings = await readSettings(member.guildId);
	return checkAdministrator(member, settings);
}

/**
 * Checks whether the member owns the guild.
 * @remarks The owner is read from the cached guild of the member, so this returns `false` if the guild is not cached.
 */
export function isGuildOwner(member: GuildMember) {
	return member.guild?.ownerId === member.id;
}

export function isOwner(member: GuildMember) {
	return member.id !== null && OWNERS.includes(member.id);
}

async function checkModerator(member: GuildMember, settings: ReadonlyGuildData) {
	const roles = settings.rolesModerator;
	return roles.length === 0 ? (await member.fetchPermissions()).has(PermissionFlagsBits.BanMembers) : hasAtLeastOneRole(member, roles);
}

async function checkAdministrator(member: GuildMember, settings: ReadonlyGuildData) {
	const roles = settings.rolesAdmin;
	return roles.length === 0 ? (await member.fetchPermissions()).has(PermissionFlagsBits.ManageGuild) : hasAtLeastOneRole(member, roles);
}

function hasAtLeastOneRole(member: GuildMember, roles: readonly string[]) {
	return roles.some((role) => member.roleIds.includes(role));
}
