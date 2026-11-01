import { readAppealOption } from '#lib/moderation/appealCommands';
import { renderAppealView } from '#lib/moderation/appealService';
import { getDisplayT } from '#lib/structures/commands/moderationCase';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { getModeration } from '#utils/functions';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { fetchAppealForm } from 'wolfstar-database';

/**
 * `/appeal view`, see the `appeal` parent command. It shows everything a member wrote in an appeal and what was decided,
 * to the moderator alone: what a member writes stays where the moderators read it.
 */
@RegisterAsSubcommand('appeal', (builder) =>
	applyLocalizedBuilder(builder, 'commands/appeal:view').addStringOption((option) =>
		applyLocalizedBuilder(option, 'commands/appeal:optionsAppeal').setRequired(true).setAutocomplete(true)
	)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'appeal view'>) {
		const t = getDisplayT(interaction, false);
		const appeal = await readAppealOption(interaction.guildId, options.appeal);
		if (appeal === null) return interaction.reply({ content: t('commands/appeal:notFound'), flags: MessageFlags.Ephemeral });

		const moderation = await getModeration(interaction.guildId);
		const entry = await moderation.fetch(appeal.caseId);
		if (entry === null) return interaction.reply({ content: t('moderation:appealCaseGone'), flags: MessageFlags.Ephemeral });

		const form = appeal.formId === null ? null : await fetchAppealForm(this.container.prisma, interaction.guildId, appeal.formId);
		return interaction.reply({
			...renderAppealView(t, appeal, entry, form?.name ?? null),
			flags: MessageFlags.Ephemeral,
			allowed_mentions: { parse: [] }
		});
	}
}
