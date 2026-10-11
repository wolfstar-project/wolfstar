import { readSettingsAuditLog, writeSettingsTransaction } from '#lib/database/settings/functions';
import type { ParsedConfiguration } from '#lib/database/settings/transfer/parse';
import { getPlannedRules, getPlannedSettings, planConfigurationImport, type ConfigurationPlan } from '#lib/database/settings/transfer/plan';
import { announceAutoModerationRulesChange, writeAutoModerationRules } from '#lib/moderation/automod/rules';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import { writeAutoModerationRulePlan, type AutoModerationRule } from 'wolfstar-database';

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
 */
export async function applyConfigurationImport(guildId: Snowflake, parsed: ParsedConfiguration, actorId: string): Promise<ConfigurationPlan> {
	// The locks are taken in the order the rest of the bot takes them, the settings and then the rules:
	using transaction = await writeSettingsTransaction(guildId);

	// This holds the lock of the rules, and gives the rules as the database has them:
	return writeAutoModerationRules(guildId, async (rules) => {
		const plan = planConfigurationImport(transaction.settings, rules, parsed);
		if (plan.isEmpty) return plan;

		const { create, update, remove } = plan.rules;
		const rulesChanged = create.length + update.length + remove.length > 0;
		const rulePlan = getPlannedRules(plan);

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
		void writeAudit(transaction.settings, actorId, plan, rules, created).catch((error: unknown) =>
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
	rules: readonly AutoModerationRule[],
	created: readonly AutoModerationRule[]
) {
	const before: Record<string, unknown> = {};
	const after: Record<string, unknown> = {};
	for (const change of plan.settings) {
		before[change.key.property] = change.before;
		after[change.key.property] = change.after;
	}

	const { create, update, remove } = plan.rules;
	if (create.length + update.length + remove.length > 0) {
		const removed = new Set(remove.map((rule) => rule.id));
		const updated = new Map(update.map(({ rule, data }) => [rule.id, data]));

		before.automodRules = rules;
		after.automodRules = [
			...rules.filter((rule) => !removed.has(rule.id)).map((rule) => Object.assign({}, rule, updated.get(rule.id))),
			...created
		];
	}

	return readSettingsAuditLog(settings).update(actorId, before, after);
}
