import { broadcastShardMessage, onShardMessage } from '#lib/sharder/messages';
import { Adder } from '#lib/database/utils/Adder';
import { WindowCounter } from '#lib/moderation/automod/detectors';
import { create } from '#utils/Security/RegexCreator';
import { Collection } from '@discordjs/collection';
import { AsyncQueue } from '@sapphire/async-queue';
import { RateLimitManager } from '@sapphire/ratelimits';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import {
	createAutoModerationRule as insertAutoModerationRule,
	deleteAutoModerationRule as removeAutoModerationRule,
	fetchAutoModerationRules,
	getDefaultAutoModerationRule,
	MaximumAutoModerationRuleNameLength,
	MaximumAutoModerationRules,
	updateAutoModerationRule as patchAutoModerationRule,
	type AutoModerationRule,
	type AutoModerationRuleData,
	type AutoModerationRuleType
} from 'wolfstar-database';

const cache = new Collection<Snowflake, readonly AutoModerationRule[]>();
const queue = new Collection<Snowflake, Promise<readonly AutoModerationRule[]>>();

/**
 * What goes wrong when a rule is created, edited or deleted, to translate for whoever asked.
 */
export type AutoModerationRuleErrorCode = 'limit' | 'nameTaken' | 'nameInvalid' | 'unknown';

export class AutoModerationRuleError extends Error {
	public constructor(public readonly code: AutoModerationRuleErrorCode) {
		super(`Auto-moderation rule error: ${code}`);
	}
}

/**
 * Reads the auto-moderation rules of a guild, from the cache after the first time.
 *
 * @param guildId - The ID of the guild.
 */
export function readAutoModerationRules(guildId: Snowflake): readonly AutoModerationRule[] | Promise<readonly AutoModerationRule[]> {
	return cache.get(guildId) ?? fetchRules(guildId);
}

/**
 * How many times the rules of each guild changed, so a query that started before a change does not cache what it read.
 */
const versions = new Collection<Snowflake, number>();

function fetchRules(guildId: Snowflake) {
	const previous = queue.get(guildId);
	if (previous) return previous;

	const version = versions.get(guildId) ?? 0;
	const promise = fetchAutoModerationRules(container.prisma.orm, guildId)
		.then((rules) => {
			if ((versions.get(guildId) ?? 0) === version) cache.set(guildId, rules);
			return rules;
		})
		.finally(() => {
			if (queue.get(guildId) === promise) queue.delete(guildId);
		});
	queue.set(guildId, promise);
	return promise;
}

/**
 * Forgets the cached rules of a guild, so they are read again the next time they are needed.
 *
 * @param guildId - The ID of the guild.
 */
export function deleteAutoModerationRulesCached(guildId: Snowflake) {
	versions.set(guildId, (versions.get(guildId) ?? 0) + 1);
	cache.delete(guildId);
	// A query that is still running read the rules before the change:
	queue.delete(guildId);
}

// The rules are cached by every shard process, so a change in one of them makes the copies of the others stale.
onShardMessage('automodRulesUpdate', ({ guildId }) => deleteAutoModerationRulesCached(guildId));

function changed(guildId: Snowflake) {
	deleteAutoModerationRulesCached(guildId);
	broadcastShardMessage({ type: 'automodRulesUpdate', guildId });
}

/**
 * Finds a rule by its ID or by its name, whatever the case.
 *
 * @param rules - The rules of the guild.
 * @param query - The ID or the name of the rule.
 */
export function findAutoModerationRule(rules: readonly AutoModerationRule[], query: string): AutoModerationRule | null {
	const text = query.trim();
	const name = text.toLowerCase();
	return rules.find((rule) => rule.id === text) ?? rules.find((rule) => rule.name.toLowerCase() === name) ?? null;
}

function validateName(rules: readonly AutoModerationRule[], name: string, ignoreId: string | null = null) {
	const trimmed = name.trim();
	if (trimmed.length === 0 || trimmed.length > MaximumAutoModerationRuleNameLength) throw new AutoModerationRuleError('nameInvalid');
	// A name made of digits could be taken for the ID of another rule:
	if (/^\d+$/.test(trimmed)) throw new AutoModerationRuleError('nameInvalid');

	const lower = trimmed.toLowerCase();
	if (rules.some((rule) => rule.id !== ignoreId && rule.name.toLowerCase() === lower)) throw new AutoModerationRuleError('nameTaken');
	return trimmed;
}

const locks = new Collection<Snowflake, AsyncQueue>();

/**
 * Runs the writes of a guild one after the other, each on the rules the database has at that time and not on the cached
 * ones, so two changes made at once do not undo each other.
 */
async function write<T>(guildId: Snowflake, callback: (rules: readonly AutoModerationRule[]) => Promise<T>): Promise<T> {
	const lock = locks.ensure(guildId, () => new AsyncQueue());
	await lock.wait();
	try {
		return await callback(await fetchAutoModerationRules(container.prisma.orm, guildId));
	} finally {
		lock.shift();
		if (lock.remaining === 0) locks.delete(guildId);
	}
}

/**
 * The name of the index that keeps the names of the rules of a guild unique, whatever the case. It catches what the
 * check of {@linkcode validateName} cannot: two processes creating the same name at once.
 */
const UniqueNameIndex = 'GuildAutoModerationRule_guild_id_name_key';

function isUniqueNameError(error: unknown) {
	for (let current = error; current instanceof Error; current = current.cause) {
		if (current.message.includes(UniqueNameIndex)) return true;
	}
	return false;
}

/**
 * Creates a rule for a guild.
 *
 * @param guildId - The ID of the guild.
 * @param name - The name of the rule, unique in the guild.
 * @param type - What the rule looks for.
 * @param data - What the rule does not take the default of.
 * @throws {@linkcode AutoModerationRuleError} When the guild has too many rules, or the name is invalid or taken.
 */
export function createAutoModerationRule(
	guildId: Snowflake,
	name: string,
	type: AutoModerationRuleType,
	data: Partial<Omit<AutoModerationRuleData, 'name' | 'type'>> = {}
): Promise<AutoModerationRule> {
	return write(guildId, async (rules) => {
		if (rules.length >= MaximumAutoModerationRules) throw new AutoModerationRuleError('limit');

		const rule = await insertAutoModerationRule(container.prisma, guildId, {
			...getDefaultAutoModerationRule(type),
			...data,
			name: validateName(rules, name),
			type
		}).catch((error) => {
			throw isUniqueNameError(error) ? new AutoModerationRuleError('nameTaken') : error;
		});
		changed(guildId);
		return rule;
	});
}

export type AutoModerationRuleUpdate = Partial<Omit<AutoModerationRuleData, 'type'>>;

/**
 * Edits a rule of a guild. The type of a rule cannot change, since its options depend on it.
 *
 * @param guildId - The ID of the guild.
 * @param ruleId - The ID of the rule.
 * @param data - What changes, or a function that reads it from the rule as the database has it. Use the function for
 * a change that depends on the rule, such as adding to one of its lists: the cached rule may be behind. It returns
 * `null` to change nothing.
 * @returns The rule after the change.
 * @throws {@linkcode AutoModerationRuleError} When the rule does not exist, or the new name is invalid or taken.
 */
export function updateAutoModerationRule(
	guildId: Snowflake,
	ruleId: string,
	data: AutoModerationRuleUpdate | ((rule: AutoModerationRule) => AutoModerationRuleUpdate | null)
): Promise<AutoModerationRule> {
	return write(guildId, async (rules) => {
		const rule = rules.find((entry) => entry.id === ruleId);
		if (!rule) throw new AutoModerationRuleError('unknown');

		const update = typeof data === 'function' ? data(rule) : data;
		if (update === null || Object.keys(update).length === 0) return rule;

		const patch = update.name === undefined ? update : { ...update, name: validateName(rules, update.name, ruleId) };
		const found = await patchAutoModerationRule(container.prisma, guildId, ruleId, patch).catch((error) => {
			throw isUniqueNameError(error) ? new AutoModerationRuleError('nameTaken') : error;
		});
		if (!found) throw new AutoModerationRuleError('unknown');

		changed(guildId);
		return { ...rule, ...patch } as AutoModerationRule;
	});
}

/**
 * Deletes a rule of a guild.
 *
 * @throws {@linkcode AutoModerationRuleError} When the rule does not exist.
 */
export function deleteAutoModerationRule(guildId: Snowflake, ruleId: string): Promise<void> {
	return write(guildId, async () => {
		if (!(await removeAutoModerationRule(container.prisma, guildId, ruleId))) throw new AutoModerationRuleError('unknown');

		states.delete(ruleId);
		changed(guildId);
	});
}

/**
 * What a rule remembers between two messages. It is rebuilt when the settings it was made from change.
 */
interface RuleState {
	signature: string;
	/** The infractions of each member, `null` when the hard action is taken at the first one. */
	adder: Adder<string> | null;
	/** The words of a `Words` rule as one expression, `null` when it has none. */
	wordFilter: RegExp | null;
	/** The mentions of each member, for a `NoMentionSpam` rule. */
	mentions: RateLimitManager | null;
	/** What each member sent lately, for the rules that count within a period (`maximum` in `timePeriod` seconds). */
	counter: WindowCounter | null;
}

const states = new Collection<string, RuleState>();

function getState(rule: AutoModerationRule): RuleState {
	const signature = JSON.stringify([rule.thresholdMaximum, rule.thresholdDuration, rule.options]);
	const existing = states.get(rule.id);
	if (existing?.signature === signature) return existing;

	const words = rule.type === 'Words' ? (rule as AutoModerationRule<'Words'>).options.words : [];
	const mentions = rule.type === 'NoMentionSpam' ? (rule as AutoModerationRule<'NoMentionSpam'>).options : null;
	const { maximum, timePeriod } = rule.options as { maximum?: number; timePeriod?: number };
	const state: RuleState = {
		signature,
		adder:
			rule.thresholdMaximum > 0 && rule.thresholdDuration > 0 ? new Adder<string>(rule.thresholdMaximum, rule.thresholdDuration, true) : null,
		wordFilter: words.length === 0 ? null : new RegExp(create(words), 'gi'),
		mentions: mentions === null ? null : new RateLimitManager(mentions.timePeriod * 1000, mentions.mentionsAllowed),
		counter: typeof maximum === 'number' && typeof timePeriod === 'number' ? new WindowCounter(timePeriod * 1000) : null
	};
	states.set(rule.id, state);
	return state;
}

/**
 * The infractions the members made of a rule, `null` when its hard action is taken at the first one.
 */
export function getAutoModerationRuleAdder(rule: AutoModerationRule): Adder<string> | null {
	return getState(rule).adder;
}

/**
 * The expression that matches the words of a rule, `null` when it has none.
 */
export function getAutoModerationRuleWordFilter(rule: AutoModerationRule<'Words'>): RegExp | null {
	return getState(rule).wordFilter;
}

/**
 * The mentions the members made lately, as a mention spam rule counts them.
 */
export function getAutoModerationRuleMentions(rule: AutoModerationRule<'NoMentionSpam'>): RateLimitManager {
	return getState(rule).mentions!;
}

/**
 * Counts what a member sent for a rule that looks at a period, such as `MessageSpam` or `LinksCooldown`.
 *
 * @param rule - A rule whose options are a `maximum` within a `timePeriod`.
 * @param key - Who sent it, and where when the rule counts by channel.
 * @param amount - How many were sent.
 * @returns Whether the member went over the maximum of the rule. Their count starts over when they did, so the next
 * message is not an infraction by itself.
 */
export function addAutoModerationRuleHits(rule: AutoModerationRule, key: string, amount: number): boolean {
	const { counter } = getState(rule);
	if (counter === null || amount <= 0) return false;

	const { maximum } = rule.options as { maximum: number };
	if (counter.add(key, amount) <= maximum) return false;

	counter.reset(key);
	return true;
}
