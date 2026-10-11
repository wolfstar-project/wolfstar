import { getSettingName } from '#lib/database/settings/Utils';
import type { ConfigurationIssue } from '#lib/database/settings/transfer/parse';
import type { ConfigurationPlan, PlannedSettingChange } from '#lib/database/settings/transfer/plan';
import { AutoModerationRuleTypeKeys } from '#lib/moderation/automod/commands';
import type { Translator } from '#lib/structures/commands/utils';
import { cutText } from '@sapphire/utilities';
import type { Guild } from '@wolfstar/plugin-gateway';
import type { APIEmbed } from 'discord-api-types/v10';
import type { ReadonlyGuildData } from 'wolfstar-database';

/**
 * How many lines of a list the preview of an import shows, so it fits an embed whatever the file holds.
 */
const MaximumPreviewLines = 12;
const MaximumValueLength = 48;
const MaximumDescriptionLength = 4000;
const MaximumMessageLength = 2000;

/**
 * What the values of a preview are stringified with.
 */
export interface ConfigurationPreviewContext {
	/** The settings of the server. */
	settings: ReadonlyGuildData;
	guild: Guild;
	t: Translator;
}

/**
 * The embed that shows what an import would change, before it asks to confirm.
 *
 * @param plan - What the import does, not empty.
 * @param context - What the values are stringified with.
 */
export async function renderConfigurationPreview(plan: ConfigurationPlan, context: ConfigurationPreviewContext): Promise<APIEmbed> {
	const { t } = context;
	const sections: string[] = [];

	if (plan.settings.length > 0) {
		const lines = await Promise.all(plan.settings.slice(0, MaximumPreviewLines).map((change) => renderSettingChange(change, context)));
		sections.push(
			[t('commands/conf:transferPreviewSettings', { count: plan.settings.length }), ...lines, ...moreLines(plan.settings.length, t)].join('\n')
		);
	}

	const { create, update, remove, unchanged } = plan.rules;
	if (create.length + update.length + remove.length > 0) {
		const lines = [
			...create.map((rule) => `+ **${rule.name}** (${t(AutoModerationRuleTypeKeys[rule.type])})`),
			...update.map(({ rule, fields }) => `~ **${rule.name}**: ${fields.map((field) => `\`${field}\``).join(', ')}`),
			...remove.map((rule) => `- **${rule.name}** (${t(AutoModerationRuleTypeKeys[rule.type])})`)
		];

		sections.push(
			[
				t('commands/conf:transferPreviewRules', { created: create.length, updated: update.length, removed: remove.length, unchanged }),
				...lines.slice(0, MaximumPreviewLines),
				...moreLines(lines.length, t)
			].join('\n')
		);
	}

	sections.push(t('commands/conf:transferPreviewFooter'));
	return {
		title: t('commands/conf:transferPreviewTitle'),
		description: cutText(sections.join('\n\n'), MaximumDescriptionLength)
	};
}

async function renderSettingChange({ key, before, after }: PlannedSettingChange, context: ConfigurationPreviewContext) {
	const name = getSettingName(context.t, key.property);
	const [previous, next] = await Promise.all([renderValue(key, before, context), renderValue(key, after, context)]);
	return `• **${name}**: ${previous} → ${next}`;
}

async function renderValue(key: PlannedSettingChange['key'], value: unknown, { settings, guild, t }: ConfigurationPreviewContext) {
	const { serializer } = key;
	const serializerContext = { entry: key, entity: settings, guild, t };

	let text: string;
	if (value === null || value === undefined) {
		text = t('commands/conf:settingNotSet');
	} else if (Array.isArray(value)) {
		const values = await Promise.all(value.map((entry) => serializer.stringify(entry as never, serializerContext)));
		text = values.length === 0 ? t('commands/conf:transferNone') : values.join(', ');
	} else {
		text = await serializer.stringify(value as never, serializerContext);
	}

	return `\`${cutText(text, MaximumValueLength)}\``;
}

function moreLines(total: number, t: Translator) {
	return total > MaximumPreviewLines ? [t('commands/conf:transferPreviewMore', { count: total - MaximumPreviewLines })] : [];
}

/**
 * The reasons a file was refused, one a line, as many as a message holds.
 */
export function renderConfigurationIssues(issues: readonly ConfigurationIssue[], t: Translator): string {
	const lines = issues.slice(0, MaximumPreviewLines).map((issue) => `• ${issue.path === '' ? '' : `\`${issue.path}\`: `}${issue.message}`);
	const content = [t('commands/conf:transferRefused', { count: issues.length }), ...lines, ...moreLines(issues.length, t)].join('\n');
	// A message holds 2000 characters, and the text of a problem is not bound:
	return cutText(content, MaximumMessageLength);
}
