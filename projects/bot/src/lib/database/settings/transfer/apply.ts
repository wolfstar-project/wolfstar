import { readSettingsAuditLog, writeSettingsTransaction } from '#lib/database/settings/functions';
import type { ParsedConfiguration } from '#lib/database/settings/transfer/parse';
import {
	findOversizedRuleLists,
	findStaleTimeoutRules,
	getPlannedRules,
	getPlannedSettings,
	planConfigurationImport,
	type ConfigurationPlan
} from '#lib/database/settings/transfer/plan';
import { announceAutoModerationRulesChange, writeAutoModerationRules } from '#lib/moderation/automod/rules';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import { writeAutoModerationRulePlan, type AutoModerationRule, type AutoModerationRulePlan } from 'wolfstar-database';

/**
 * What an import throws when the server changed since the file was read in a way that makes the file one it would
 * have refused: nothing was written, and the file has to be read again.
 */
export class ConfigurationImportStaleError extends Error {
	public constructor() {
		super('The server changed since the file of the import was read.');
	}
}

/**
 * Writes what a file holds to a server, in one database transaction: the settings and the rules are all written or none
 * is.
 *
 * @remarks
 *
 * What is written is worked out again from what the database has under the locks of the settings and of the rules, not
 * from what the user was shown, since the server may have changed while they decided. A plan that finds nothing to do
 * writes nothing.
 *
 * @param guildId - The ID of the server.
 * @param parsed - What the file holds, see `parseConfigurationFile`.
 * @param actorId - The user who confirmed the import, for the audit log.
 * @returns What was done.
 * @throws {@linkcode ConfigurationImportStaleError} When a list of a rule of the file is longer than the limit and than
 * the one the rule of the server has by now, which the file was allowed for when it was read, or when a rule of the
 * file is a Timeout with no duration and the rule of the server no longer is one.
 */
export async function applyConfigurationImport(guildId: Snowflake, parsed: ParsedConfiguration, actorId: string): Promise<ConfigurationPlan> {
	// The locks are taken in the order the rest of the bot takes them, the settings and then the rules:
	using transaction = await writeSettingsTransaction(guildId);

	// This holds the lock of the rules, and gives the rules as the database has them. It is awaited here: the lock of
	// the settings is released when this function returns, which a promise that is only returned does before it settles.
	return await writeAutoModerationRules(guildId, async (rules) => {
		if (findOversizedRuleLists(rules, parsed).length > 0) throw new ConfigurationImportStaleError();
		if (findStaleTimeoutRules(rules, parsed).length > 0) throw new ConfigurationImportStaleError();

		const plan = planConfigurationImport(transaction.settings, rules, parsed);
		if (plan.isEmpty) return plan;

		const rulePlan = getPlannedRules(plan);
		const rulesChanged = rulePlan.create.length + rulePlan.update.length + rulePlan.remove.length > 0;

		let created: AutoModerationRule[] = [];
		transaction.write(getPlannedSettings(plan));
		await transaction.submit(
			rulesChanged
				? async (tx) => {
						created = await writeAutoModerationRulePlan(tx, guildId, rulePlan, transaction.settings.language);
					}
				: undefined
		);

		if (rulesChanged) announceAutoModerationRulesChange(guildId, rulePlan.remove);
		void writeAudit(transaction.settings, actorId, plan, rulePlan, rules, created).catch((error: unknown) =>
			container.logger.warn('[Settings] Could not write the audit log of an import:', error)
		);

		return plan;
	});
}

/**
 * Writes the import to the audit log: the settings it changed by their property, as every other change of the settings
 * is, and the rules it changed as a list of them under `automodRules`.
 */
function writeAudit(
	settings: Parameters<typeof readSettingsAuditLog>[0],
	actorId: string,
	plan: ConfigurationPlan,
	rulePlan: AutoModerationRulePlan,
	rules: readonly AutoModerationRule[],
	created: readonly AutoModerationRule[]
) {
	const before: Record<string, unknown> = {};
	const after: Record<string, unknown> = {};
	for (const change of plan.settings) {
		before[change.key.property] = change.before;
		after[change.key.property] = change.after;
	}

	if (rulePlan.create.length + rulePlan.update.length + rulePlan.remove.length > 0) {
		const removed = new Set(rulePlan.remove);
		const updated = new Map(rulePlan.update.map(({ id, data }) => [id, data]));

		// The rules that are created have the last IDs, so this is the order the rules are read in from now on:
		before.automodRules = rules;
		after.automodRules = [
			...rules.filter((rule) => !removed.has(rule.id)).map((rule) => Object.assign({}, rule, updated.get(rule.id))),
			...created
		];
	}

	return readSettingsAuditLog(settings).update(actorId, before, after);
}
