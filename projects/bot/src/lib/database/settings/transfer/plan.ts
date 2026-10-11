import { toConfigurationRule, type ConfigurationRule } from '#lib/database/settings/transfer/format';
import type { ParsedConfiguration } from '#lib/database/settings/transfer/parse';
import type { SchemaKey } from '#lib/database/settings/schema/SchemaKey';
import { isDeepStrictEqual } from 'node:util';
import {
	getDefaultAutoModerationRule,
	MaximumAutoModerationRuleListLength,
	type AutoModerationRule,
	type AutoModerationRulePlan,
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
 * What an import does to the server it is run in.
 */
export interface ConfigurationPlan {
	settings: PlannedSettingChange[];
	rules: {
		/** The rules of the file the server has no rule of the same name and type for. */
		create: ConfigurationRule[];
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
		for (const data of parsed.rules) {
			const lower = data.name.toLowerCase();
			const rule = unmatched.get(lower);

			if (rule === undefined) {
				plan.rules.create.push(data);
				continue;
			}

			unmatched.delete(lower);
			if (rule.type !== data.type) {
				plan.rules.remove.push(rule);
				plan.rules.create.push(data);
				continue;
			}

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
 * defaults of its type, which have none.
 */
export function getPlannedRules(plan: ConfigurationPlan): AutoModerationRulePlan {
	return {
		remove: plan.rules.remove.map((rule) => rule.id),
		update: plan.rules.update.map(({ rule, fields, data }) => ({
			id: rule.id,
			data: Object.fromEntries(fields.map((field) => [field, data[field]]))
		})),
		create: plan.rules.create.map((data) => ({ ...getDefaultAutoModerationRule(data.type), ...data }))
	};
}
