import { toConfigurationRule, type ConfigurationRule } from '#lib/database/settings/transfer/format';
import type { ParsedConfiguration } from '#lib/database/settings/transfer/parse';
import type { SchemaKey } from '#lib/database/settings/schema/SchemaKey';
import { isDeepStrictEqual } from 'node:util';
import {
	getDefaultAutoModerationRule,
	MaximumAutoModerationRuleListLength,
	type AutoModerationRule,
	type AutoModerationRulePlan,
	type AutoModerationRuleType,
	type GuildData,
	type ReadonlyGuildData
} from 'wolfstar-database';

/**
 * A setting an import changes.
 */
export interface PlannedSettingChange {
	key: SchemaKey;
	before: unknown;
	after: unknown;
}

/**
 * A rule of the server an import edits, with the fields that differ from the file.
 */
interface PlannedRuleUpdate {
	rule: AutoModerationRule;
	fields: (keyof ConfigurationRule)[];
	data: ConfigurationRule;
}

/**
 * A rule an import makes.
 */
export interface PlannedRuleCreate {
	data: ConfigurationRule;
	/**
	 * The rule of the server this one takes the place of, `null` for a rule the server does not have. The rule it
	 * replaces is the same rule (its name and its type), which stands before a rule the file has it after: it is deleted
	 * and made again, with the exempt roles and channels it had, so it is where the file says.
	 */
	replaces: AutoModerationRule | null;
}

/**
 * What an import does to the server it is run in.
 */
export interface ConfigurationPlan {
	settings: PlannedSettingChange[];
	rules: {
		/**
		 * The rules that are made, in the order of the file, which is the order they are created in: the ones the server
		 * has no rule of the same name and type for, and the ones that are made again to change place (`replaces`).
		 */
		create: PlannedRuleCreate[];
		/** The rules of the server that have a rule of the file with their name and type, and differ from it. */
		update: PlannedRuleUpdate[];
		/** The rules of the server the file does not have, or has with another type. */
		remove: AutoModerationRule[];
		/** How many rules the file and the server agree on. */
		unchanged: number;
	};
	/** Whether the server already is as the file says. */
	isEmpty: boolean;
}

/**
 * Works out what an import changes.
 *
 * @remarks
 *
 * - A setting is only written when its value differs, and the settings the file does not have are left as they are.
 * - The rules of the server become the ones of the file, which is what a copy and a restore of a backup both want. A rule
 *   is the same rule when it has the same name (whatever the case) and the same type, which is kept and edited in place:
 *   it keeps its ID, its exempt roles and channels, and what it counted of the members. One of another type is deleted
 *   and made again, since the options of a rule depend on its type. The rules of the server are left alone when the file
 *   has no `automod` section.
 * - The rules of a type are in the order of the file once it is imported, since a message is held to the first enabled
 *   rule of a type it infringes: the order decides which punishment a member gets. The rules have no position of their
 *   own, they are read by their ID, oldest first, and a rule that is created gets an ID after every other. So the rules
 *   of a type that stay as they are are the first ones of the file, as long as the server has them in that order; from
 *   the first one that is new or out of place on, the rules of that type are made again, in the order of the file. A rule
 *   that is made again keeps its exempt roles and channels, and loses its ID and what it counted. The order between
 *   rules of different types changes nothing, so it is not kept and it moves no rule.
 *
 * @param settings - The settings of the server, as the database has them.
 * @param rules - The rules of the server, as the database has them.
 * @param parsed - What the file holds, see `parseConfigurationFile`.
 */
export function planConfigurationImport(
	settings: ReadonlyGuildData,
	rules: readonly AutoModerationRule[],
	parsed: ParsedConfiguration
): ConfigurationPlan {
	const changes: PlannedSettingChange[] = [];
	for (const { key, value } of parsed.settings) {
		const before = settings[key.property];
		if (!isDeepStrictEqual(before, value)) changes.push({ key, before, after: value });
	}

	const plan: ConfigurationPlan = {
		settings: changes,
		rules: { create: [], update: [], remove: [], unchanged: 0 },
		isEmpty: false
	};

	if (parsed.rules !== null) {
		const unmatched = new Map(rules.map((rule) => [rule.name.toLowerCase(), rule]));
		// The ID of the last rule of each type that stays, `null` once a rule of the type is made: every rule of the
		// type the file has after it has to be made after it.
		const last = new Map<AutoModerationRuleType, bigint | null>();

		for (const data of parsed.rules) {
			const lower = data.name.toLowerCase();
			const rule = unmatched.get(lower);

			if (rule === undefined) {
				plan.rules.create.push({ data, replaces: null });
				last.set(data.type, null);
				continue;
			}

			unmatched.delete(lower);
			if (rule.type !== data.type) {
				plan.rules.remove.push(rule);
				plan.rules.create.push({ data, replaces: null });
				last.set(data.type, null);
				continue;
			}

			const id = BigInt(rule.id);
			const previous = last.get(data.type);
			if (previous === null || (previous !== undefined && id < previous)) {
				plan.rules.create.push({ data, replaces: rule });
				last.set(data.type, null);
				continue;
			}

			last.set(data.type, id);
			const current = toConfigurationRule(rule);
			const fields = (Object.keys(data) as (keyof ConfigurationRule)[]).filter((field) => !isDeepStrictEqual(current[field], data[field]));
			if (fields.length === 0) plan.rules.unchanged += 1;
			else plan.rules.update.push({ rule, fields, data });
		}

		plan.rules.remove.push(...unmatched.values());
	}

	plan.isEmpty = changes.length === 0 && plan.rules.create.length === 0 && plan.rules.update.length === 0 && plan.rules.remove.length === 0;
	return plan;
}

/**
 * How many rules of each kind a plan changes, for what the user is told: the rules that are made again to change place
 * are neither created nor deleted for them.
 */
export function countPlannedRules(plan: ConfigurationPlan) {
	const moved = plan.rules.create.filter((rule) => rule.replaces !== null).length;
	return {
		created: plan.rules.create.length - moved,
		updated: plan.rules.update.length,
		moved,
		removed: plan.rules.remove.length,
		unchanged: plan.rules.unchanged
	};
}

/**
 * A list of the options of a rule of a file that is longer than the server lets it be.
 */
export interface OversizedRuleList {
	/** The name of the rule. */
	rule: string;
	/** The option of the rule that holds the list, `words`. */
	option: string;
}

/**
 * Finds the lists of the rules of a file that are longer than `MaximumAutoModerationRuleListLength` and than the list
 * the rule of the server with the same name and type has.
 *
 * @remarks `parseConfigurationFile` refuses them, against the rules the server had when the file was read. This is the
 * same check against the rules it has when the import is written, which may be later: a list that was shortened
 * meanwhile no longer allows the one of the file.
 *
 * @param rules - The rules of the server, as the database has them.
 * @param parsed - What the file holds, see `parseConfigurationFile`.
 */
export function findOversizedRuleLists(rules: readonly AutoModerationRule[], parsed: ParsedConfiguration): OversizedRuleList[] {
	const oversized: OversizedRuleList[] = [];
	for (const data of parsed.rules ?? []) {
		const lower = data.name.toLowerCase();
		const current = rules.find((rule) => rule.type === data.type && rule.name.toLowerCase() === lower);
		const currentOptions = (current?.options ?? {}) as Record<string, unknown>;

		for (const [option, value] of Object.entries(data.options)) {
			if (!Array.isArray(value) || value.length <= MaximumAutoModerationRuleListLength) continue;

			const previous = currentOptions[option];
			if (!Array.isArray(previous) || value.length > previous.length) oversized.push({ rule: data.name, option });
		}
	}

	return oversized;
}

/**
 * The changes of a plan to the settings, as `writeSettings` takes them.
 */
export function getPlannedSettings(plan: ConfigurationPlan): Partial<GuildData> {
	const data: Record<string, unknown> = {};
	for (const { key, after } of plan.settings) data[key.property] = after;
	return data as Partial<GuildData>;
}

/**
 * The writes of a plan to the rules, as the database takes them. A rule is edited with the fields that differ and
 * nothing else, so its exempt roles and channels are the ones the server has; a rule that is created starts from the
 * defaults of its type, which have none, and one that is made again to change place takes the ones of the rule it
 * replaces, which is deleted.
 */
export function getPlannedRules(plan: ConfigurationPlan): AutoModerationRulePlan {
	const replaced = plan.rules.create.flatMap(({ replaces }) => (replaces === null ? [] : [replaces.id]));
	return {
		remove: [...plan.rules.remove.map((rule) => rule.id), ...replaced],
		update: plan.rules.update.map(({ rule, fields, data }) => ({
			id: rule.id,
			data: Object.fromEntries(fields.map((field) => [field, data[field]]))
		})),
		create: plan.rules.create.map(({ data, replaces }) => ({
			...getDefaultAutoModerationRule(data.type),
			...data,
			...(replaces === null ? {} : { ignoredRoles: replaces.ignoredRoles, ignoredChannels: replaces.ignoredChannels })
		}))
	};
}
