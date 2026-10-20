import { toErrorCodeResult } from '#common';
import { readSettings } from '#lib/database/settings/functions';
import { fetchGuildT } from '#lib/moderation/common';
import { isNullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { GuildMember, User } from '@wolfstar/plugin-gateway';
import { PermissionFlagsBits, RESTJSONErrorCodes } from 'discord-api-types/v10';
import { fetchStickyNickname } from 'wolfstar-database';

/**
 * What a name that is listed above the others starts with: spaces and the ASCII punctuation the member list sorts
 * before the digits and the letters (`!` to `/`).
 */
const HoistingPrefix = /^[\s!-/]+/u;

/**
 * The longest nickname Discord takes.
 */
const MaximumNicknameLength = 32;

/**
 * The nickname of a member whose name and username are nothing but what hoists them.
 */
export const DehoistedNickname = 'dehoisted';

/**
 * The nickname that dehoists a member, or `null` when their name is not hoisted.
 *
 * @remarks
 *
 * The name loses what hoists it. A name that is nothing else takes the username in its place, cut the same way (a
 * username may start with `.`), and a username that is nothing else either takes {@link DehoistedNickname}.
 *
 * @param name - The name the member list shows: the nickname, else the display name of the user.
 * @param username - The username of the member.
 */
export function getDehoistedNickname(name: string, username: string): string | null {
	const dehoisted = name.replace(HoistingPrefix, '');
	if (dehoisted === name) return null;

	const nickname = dehoisted || username.replace(HoistingPrefix, '') || DehoistedNickname;
	return nickname.slice(0, MaximumNicknameLength);
}

/**
 * Dehoists a member when the guild turned `moderation.dehoist` on: the name they show is given a nickname without the
 * characters that list it above the others.
 *
 * @remarks
 *
 * A member with a sticky nickname keeps it, since a moderator chose it, and so does a member who can manage the
 * nicknames, who would only set theirs back. A member the bot is not above is left alone, and one who left meanwhile
 * is not an error.
 *
 * @param member - The member.
 * @param user - The user of the member.
 */
export async function dehoistMember(member: GuildMember, user: User): Promise<void> {
	const settings = await readSettings(member.guildId);
	if (!settings.moderationDehoist) return;

	const nickname = getDehoistedNickname(member.nickname ?? user.globalName ?? user.username, user.username);
	if (nickname === null) return;

	const { gatewayClient, logger, prisma } = container;
	const sticky = await fetchStickyNickname(prisma, member.guildId, user.id);
	if (!isNullish(sticky)) return;

	const permissions = await member.fetchPermissions();
	if (permissions.has(PermissionFlagsBits.ManageNicknames)) return;

	const me = await gatewayClient.members.fetchMe(member.guildId);
	await me.roles.fetch();
	if (!(await me.permissions).has(PermissionFlagsBits.ManageNicknames)) return;

	// Discord refuses to rename a member whose highest role is not below the one of the bot, asking would only fail:
	await member.roles.fetch();
	const position = (await me.roles.highest)?.position ?? 0;
	if (((await member.roles.highest)?.position ?? 0) >= position) return;

	const t = await fetchGuildT({ id: member.guildId });
	const result = await toErrorCodeResult(
		gatewayClient.api.guilds.editMember(member.guildId, user.id, { nick: nickname }, { reason: t('moderationActions:dehoistReason') })
	);
	result.inspectErr((code) => {
		// The member left meanwhile, or is the owner of the server:
		if (code === RESTJSONErrorCodes.UnknownMember || code === RESTJSONErrorCodes.MissingPermissions) return;
		logger.error(`[DEHOIST] Could not dehoist a member (${code}).`);
	});
}
