import { editRuleListEntry, resolveCommandRule, translateRuleError } from '#lib/moderation/automod/commands';
import { updateAutoModerationRule } from '#lib/moderation/automod/rules';
import type { AutoModerationMenuSection } from '#lib/structures/automod-menu/ids';
import { renderAutoModerationRule } from '#lib/structures/automod-menu/render';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { getSupportedUserLanguageT, type TFunction } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';
import type { AutoModerationRule } from 'wolfstar-database';

/**
 * Answers a command with the menu of a rule, for the user who ran it only.
 *
 * @param rule - The rule to open, as the command left it.
 * @param section - The section of the rule the command changed.
 * @param notice - What the command did, shown above the section.
 */
export function replyWithAutoModerationRule(
	interaction: GuildChatInputInteraction,
	t: TFunction,
	rule: AutoModerationRule,
	section: AutoModerationMenuSection,
	notice?: string
) {
	const message = renderAutoModerationRule({ t, ownerId: interaction.user.id }, rule, section, { notice });
	return interaction.reply({ ...message, flags: message.flags! | MessageFlags.Ephemeral });
}

/**
 * Runs `/automod add` and `/automod remove`: adds an entry to the list of a rule, or removes it, then opens the rule.
 */
export async function editRuleList(interaction: GuildChatInputInteraction, options: { rule: string; value: string }, action: 'add' | 'remove') {
	const t = getSupportedUserLanguageT(interaction);
	const cached = await resolveCommandRule(interaction, t, options.rule);
	if (cached === null) return;

	// The list is edited on the rule the database has, the cached one may be behind another change:
	let content!: string;
	let updated: AutoModerationRule;
	try {
		updated = await updateAutoModerationRule(interaction.guildId, cached.id, (rule) => {
			const result = editRuleListEntry(t, rule, options.value, action);
			content = result.content;
			return result.list === null ? null : { options: { ...rule.options, [result.key]: result.list } as AutoModerationRule['options'] };
		});
	} catch (error) {
		return interaction.reply({ content: translateRuleError(t, error, options.rule), flags: MessageFlags.Ephemeral });
	}

	return replyWithAutoModerationRule(interaction, t, updated, 'options', content);
}
