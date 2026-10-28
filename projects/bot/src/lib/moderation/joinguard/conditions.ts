import { DiscordSnowflake } from '@sapphire/snowflake';
import { remove as removeConfusables } from 'confusables';
import { UserFlags, type Snowflake } from 'discord-api-types/v10';
import type { JoinGuardRule, JoinGuardSettings } from 'wolfstar-database';

/**
 * What the join guard reads of a user who joins.
 */
export interface JoinGuardUser {
	id: Snowflake;
	username: string;
	globalName: string | null;
	avatar: string | null;
	bot: boolean;
	/** The public flags of the user, as a number. */
	flags: number;
}

/**
 * What the rules of the join guard look at, read once from the user who joins.
 */
export interface JoinGuardSignals {
	/** When the account was made, in milliseconds, read from its ID. */
	accountCreatedAt: number;
	/** The account has no avatar of its own. */
	defaultAvatar: boolean;
	/** The username, or the global name, looks generated, see {@linkcode isGeneratedName}. */
	generatedName: boolean;
	/** The username and the global name, normalized as `nameContains` is matched, see {@linkcode normalizeJoinGuardText}. */
	names: readonly string[];
	/** An app account that is not a verified bot. */
	unverifiedBot: boolean;
}

/**
 * Normalizes a text as the auto-moderation does before it looks for a word: the look-alike characters are replaced by
 * the letters they look like, and the case does not count.
 */
export function normalizeJoinGuardText(text: string): string {
	return removeConfusables(text.trim().toLowerCase()).toLowerCase();
}

/**
 * The years a username often ends with, which a real person writes their birth year as: `john1998` is not generated.
 */
const MinimumYear = 1950;
const MaximumYear = 2029;

/**
 * Whether a name looks generated, as the accounts of a raid or of a spam bot are named. It is conservative, since a
 * false positive stops a real person: it only answers `true` for the shapes a person seldom picks.
 *
 * - Discord's default `name1234` pattern: letters, then four digits or more, but a year (`john1998`);
 * - a run of five digits or more anywhere (`user84721938`);
 * - letters and digits that alternate (`a8f3k2l9`), six switches or more in a name of eight characters or more, so a
 * name written with a digit for a letter (`j0hn2k21`) is not;
 * - a run of seven consonants or more with no vowel (`xkcdqzrt`), `y` counted as a vowel, so a long word is not;
 * - a long hexadecimal string with letters and digits (`3fa9c0d1e27b`).
 *
 * @param name - A username or a global name.
 */
export function isGeneratedName(name: string): boolean {
	const text = name.trim().toLowerCase();
	if (text.length === 0) return false;

	// Letters, then the digits Discord adds when the name is taken:
	const suffixed = /^([a-z]+)[._]?(\d{4,})$/.exec(text);
	if (suffixed !== null) {
		const digits = suffixed[2];
		const year = Number(digits);
		if (digits.length > 4 || year < MinimumYear || year > MaximumYear) return true;
	}

	if (/\d{5,}/.test(text)) return true;
	if (/[bcdfghjklmnpqrstvwxz]{7,}/.test(text)) return true;
	if (text.length >= 12 && /^[0-9a-f]+$/.test(text) && /\d/.test(text) && /[a-f]/.test(text)) return true;

	const compact = text.replaceAll(/[._-]/g, '');
	if (compact.length >= 8 && /^[a-z0-9]+$/.test(compact)) {
		let switches = 0;
		for (let index = 1; index < compact.length; index++) {
			if (isDigit(compact[index]) !== isDigit(compact[index - 1])) switches++;
		}
		if (switches >= 6) return true;
	}

	return false;
}

function isDigit(character: string) {
	return character >= '0' && character <= '9';
}

/**
 * Reads the signals of a user who joins.
 *
 * @param user - The user.
 */
export function readJoinGuardSignals(user: JoinGuardUser): JoinGuardSignals {
	const names = [user.username, ...(user.globalName === null ? [] : [user.globalName])];
	return {
		accountCreatedAt: DiscordSnowflake.timestampFrom(user.id),
		defaultAvatar: user.avatar === null,
		generatedName: names.some((name) => isGeneratedName(normalizeJoinGuardText(name))),
		names: names.map((name) => normalizeJoinGuardText(name)),
		unverifiedBot: user.bot && (user.flags & UserFlags.VerifiedBot) === 0
	};
}

/**
 * Whether a rule sets at least one condition: one with none would stop everybody, and is never matched.
 */
export function hasJoinGuardConditions(rule: JoinGuardRule): boolean {
	return rule.accountAgeMax !== null || rule.defaultAvatar || rule.generatedName || rule.nameContains !== null || rule.unverifiedBot;
}

/**
 * Whether a rule matches the signals of a member who joins: it is enabled, it sets a condition, and every condition it
 * sets matches.
 *
 * @param rule - The rule.
 * @param signals - What the member looks like.
 * @param now - The time the member joined, in milliseconds.
 */
export function matchesJoinGuardRule(rule: JoinGuardRule, signals: JoinGuardSignals, now: number): boolean {
	if (!rule.enabled || !hasJoinGuardConditions(rule)) return false;

	if (rule.accountAgeMax !== null && now - signals.accountCreatedAt >= rule.accountAgeMax * 1000) return false;
	if (rule.defaultAvatar && !signals.defaultAvatar) return false;
	if (rule.generatedName && !signals.generatedName) return false;
	if (rule.unverifiedBot && !signals.unverifiedBot) return false;
	if (rule.nameContains !== null) {
		const text = normalizeJoinGuardText(rule.nameContains);
		if (text.length === 0 || !signals.names.some((name) => name.includes(text))) return false;
	}

	return true;
}

/**
 * Whether the join guard leaves a member alone: they are an allowed user, or hold an allowed role (the roles a member
 * gets back on join, from the sticky roles, count).
 *
 * @param settings - The settings of the guard.
 * @param userId - The member.
 * @param roleIds - The roles the member has.
 */
export function isJoinGuardAllowed(
	settings: Pick<JoinGuardSettings, 'joinGuardAllowedUsers' | 'joinGuardAllowedRoles'>,
	userId: Snowflake,
	roleIds: Iterable<Snowflake>
): boolean {
	if (settings.joinGuardAllowedUsers.includes(userId)) return true;
	for (const roleId of roleIds) {
		if (settings.joinGuardAllowedRoles.includes(roleId)) return true;
	}
	return false;
}
