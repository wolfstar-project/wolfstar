import { toErrorCodeResult } from '#common';
import { readSettings } from '#lib/database/settings/functions';
import { fetchGuildT } from '#lib/moderation/common';
import { withNicknameLock } from '#lib/moderation/common/nicknames';
import sanitize from '@aero/sanitizer';
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
 * The characters a clean name is made of: the printable ASCII ones and the Latin-1 ones, so the accents of a name
 * (`José`, `Niccolò`) are kept and the fancy fonts, the zalgo, the symbols and the emojis are not.
 */
const PlainCharacters = /^[\x20-\x7E\u00A0-\u00FF]*$/u;

/**
 * The shortest and the longest nickname the dehoisting sets. Discord takes 1 to 32 characters; a single one left of a
 * name is not worth keeping.
 */
const MinimumNicknameLength = 2;
const MaximumNicknameLength = 32;

/**
 * The nickname of a member none of whose names can be cleaned.
 */
export const DehoistedNickname = 'dehoisted';

/**
 * The names of a member, the nickname and the display name of their user being the ones they may not have.
 */
export interface MemberNames {
	nickname: string | null;
	globalName: string | null;
	username: string;
}

/**
 * What the dehoisting does to the nickname of a member: sets it, or removes it (`null`) so the display name shows.
 */
export interface DehoistChange {
	nick: string | null;
}

/**
 * Whether a name is clean: it is not hoisted, and has none of the characters {@link PlainCharacters} leaves out.
 */
function isCleanName(name: string): boolean {
	return !HoistingPrefix.test(name) && PlainCharacters.test(name);
}

/**
 * Cleans a name as the Fire bot does: a name with characters that are not plain is turned into plain ASCII
 * (`@aero/sanitizer`: the accents, the fancy fonts, the zalgo and the other scripts become the letters they stand
 * for, what has none is dropped), then loses what hoists it.
 */
function cleanName(name: string): string {
	const plain = PlainCharacters.test(name) ? name : sanitize(name);
	return plain.replace(HoistingPrefix, '').replaceAll(/\s+/gu, ' ').slice(0, MaximumNicknameLength).trim();
}

/**
 * What the dehoisting changes of a member whose name is hoisted or made of characters that are not plain, `null` when
 * the name they show is clean.
 *
 * @remarks
 *
 * The name the member shows (the nickname, else the display name, else the username) is cleaned. When too little of
 * it is left, a nickname is removed when the name shown without it is clean, else the username is cleaned in its
 * place, and a username that cannot be cleaned either takes {@link DehoistedNickname}.
 *
 * @param names - The names of the member.
 */
export function getDehoistChange(names: MemberNames): DehoistChange | null {
	const shown = names.nickname ?? names.globalName ?? names.username;
	if (isCleanName(shown)) return null;

	const cleaned = cleanName(shown);
	if (cleaned.length >= MinimumNicknameLength) return { nick: cleaned };

	if (names.nickname !== null && isCleanName(names.globalName ?? names.username)) return { nick: null };

	const username = cleanName(names.username);
	return { nick: username.length >= MinimumNicknameLength ? username : DehoistedNickname };
}

/**
 * Dehoists a member when the guild turned `moderation.dehoist` on: the name they show is given a nickname without the
 * characters that list it above the others nor the ones that are not plain text, see {@linkcode getDehoistChange}.
 *
 * @remarks
 *
 * A member with a sticky nickname keeps it, since a moderator chose it, and so does a member who can manage the
 * nicknames, who would only set theirs back. A member the bot is not above is left alone, and one who left meanwhile
 * is not an error. The nickname is read again and written under the lock `/setnickname` takes
 * ({@linkcode withNicknameLock}), so what a moderator sets while the checks run is not overwritten.
 *
 * @param member - The member.
 * @param user - The user of the member.
 */
export async function dehoistMember(member: GuildMember, user: User): Promise<void> {
	const settings = await readSettings(member.guildId);
	if (!settings.moderationDehoist) return;

	// Most names are clean, which costs nothing to tell:
	if (getDehoistChange({ nickname: member.nickname, globalName: user.globalName, username: user.username }) === null) return;

	const permissions = await member.fetchPermissions();
	if (permissions.has(PermissionFlagsBits.ManageNicknames)) return;

	const { gatewayClient, logger, prisma } = container;
	const me = await gatewayClient.members.fetchMe(member.guildId);
	await me.roles.fetch();
	if (!(await me.permissions).has(PermissionFlagsBits.ManageNicknames)) return;

	// Discord refuses to rename a member whose highest role is not below the one of the bot, asking would only fail:
	await member.roles.fetch();
	const [ownHighest, memberHighest] = await Promise.all([me.roles.highest, member.roles.highest]);
	if (isNullish(ownHighest) || (!isNullish(memberHighest) && ownHighest.comparePositionTo(memberHighest) <= 0)) return;

	const t = await fetchGuildT({ id: member.guildId });
	await withNicknameLock(member.guildId, user.id, async () => {
		const sticky = await fetchStickyNickname(prisma, member.guildId, user.id);
		if (!isNullish(sticky)) return;

		// The member as Discord has it now, since a moderator may have renamed them while the checks ran:
		const current = await toErrorCodeResult(gatewayClient.api.guilds.getMember(member.guildId, user.id));
		if (current.isErr()) return;

		const { nick, user: currentUser } = current.unwrap();
		const change = getDehoistChange({ nickname: nick ?? null, globalName: currentUser.global_name, username: currentUser.username });
		if (change === null) return;

		const result = await toErrorCodeResult(
			gatewayClient.api.guilds.editMember(member.guildId, user.id, change, { reason: t('moderationActions:dehoistReason') })
		);
		result.inspectErr((code) => {
			// The member left meanwhile, or is the owner of the server:
			if (code === RESTJSONErrorCodes.UnknownMember || code === RESTJSONErrorCodes.MissingPermissions) return;
			logger.error(`[DEHOIST] Could not dehoist a member (${code}).`);
		});
	});
}
