import { Emojis, type EmojiKey } from '#utils/emojis';
import { userMention } from '@discordjs/builders';
import { BitField } from '@sapphire/bitfield';
import { UserFlags, type Snowflake } from 'discord-api-types/v10';

const ExtendedUserFlagBits = new BitField({
	Quarantined: getExtendedBits(UserFlags.Quarantined),
	Collaborator: getExtendedBits(UserFlags.Collaborator),
	RestrictedCollaborator: getExtendedBits(UserFlags.RestrictedCollaborator)
});

export function getModerationFlags(bitfield: number) {
	return {
		spammer: (bitfield & UserFlags.Spammer) === UserFlags.Spammer,
		quarantined: ExtendedUserFlagBits.has(getExtendedBits(bitfield), ExtendedUserFlagBits.flags.Quarantined)
	};
}

export function getModerationFlagsString(bitfield: number) {
	const { spammer, quarantined } = getModerationFlags(bitfield);
	if (spammer && quarantined) return Emojis.SpammerIcon + Emojis.QuarantinedIcon;
	if (spammer) return Emojis.SpammerIcon;
	if (quarantined) return Emojis.QuarantinedIcon;
	return '';
}

/**
 * The badges Discord shows on the profile of a user, in the order it shows them, with the emoji of each.
 */
const UserBadges: readonly (readonly [flag: number, emoji: EmojiKey])[] = [
	[UserFlags.Staff, 'BadgeStaff'],
	[UserFlags.Partner, 'BadgePartner'],
	[UserFlags.CertifiedModerator, 'BadgeCertifiedModerator'],
	[UserFlags.Hypesquad, 'BadgeHypesquad'],
	[UserFlags.HypeSquadOnlineHouse1, 'BadgeBravery'],
	[UserFlags.HypeSquadOnlineHouse2, 'BadgeBrilliance'],
	[UserFlags.HypeSquadOnlineHouse3, 'BadgeBalance'],
	[UserFlags.BugHunterLevel1, 'BadgeBugHunter'],
	[UserFlags.BugHunterLevel2, 'BadgeBugHunterGold'],
	[UserFlags.ActiveDeveloper, 'BadgeActiveDeveloper'],
	[UserFlags.VerifiedDeveloper, 'BadgeVerifiedDeveloper'],
	[UserFlags.PremiumEarlySupporter, 'BadgeEarlySupporter']
];

/**
 * Lists the badges of a user, the ones their public flags say they have.
 *
 * @remarks Nitro and the boosts are not flags, so a bot cannot tell them.
 *
 * @param bitfield - The public flags of the user.
 * @returns The keys of the emojis of the badges, in the order Discord shows them.
 */
export function getUserBadges(bitfield: number): EmojiKey[] {
	return UserBadges.filter(([flag]) => (bitfield & flag) === flag).map(([, emoji]) => emoji);
}

/**
 * Writes the badges of a user as emojis, empty when they have none.
 *
 * @param bitfield - The public flags of the user.
 */
export function getUserBadgesString(bitfield: number): string {
	return getUserBadges(bitfield)
		.map((key) => Emojis[key])
		.join(' ');
}

export function getUserMentionWithFlagsString(bitfield: number, userId: Snowflake) {
	const flags = getModerationFlagsString(bitfield);
	const mention = userMention(userId);
	return flags ? `${mention} ${flags}` : mention;
}

function getExtendedBits(bitfield: number) {
	return (bitfield / (1 << 30)) | 0;
}
