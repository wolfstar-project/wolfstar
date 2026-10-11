import { readSettings } from '#lib/database';
import { downloadConfigurationFile } from '#lib/database/settings/transfer/attachment';
import { MaximumConfigurationFileSize } from '#lib/database/settings/transfer/format';
import { parseConfigurationFile } from '#lib/database/settings/transfer/parse';
import { PendingImportSeconds, renderSettingsImportButtons, savePendingImport } from '#lib/database/settings/transfer/pending';
import { planConfigurationImport } from '#lib/database/settings/transfer/plan';
import { renderConfigurationIssues, renderConfigurationPreview } from '#lib/database/settings/transfer/render';
import { readAutoModerationRules } from '#lib/moderation/automod/rules';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { resolveGuild, seconds } from '#common';
import { time, TimestampStyles } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommandGroup } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/settings server import`, see the `settings` parent command.
 *
 * Reads a file `/settings server export` made, shows what it would change and asks to confirm before anything is written.
 *
 * @remarks
 *
 * - It requires the administrator permission level, and every reply is ephemeral.
 * - The file is not trusted: every setting goes through the validation it has when it is edited, and a file with a single
 *   problem is refused whole, with every problem it has. What depends on the server is left as it is.
 * - Nothing waits in this process for the answer: what the file holds is kept in Redis for five minutes and the buttons
 *   are answered by the `settingsImport` interaction handler, on whichever process gets the click.
 * - What is written is worked out again when the administrator confirms, from what the database has by then, and it is one
 *   database transaction: the settings and the rules are all written or none is. See `lib/database/settings/transfer`.
 */
@RegisterAsSubcommandGroup('settings', 'server', (builder) =>
	applyLocalizedBuilder(builder, 'commands/conf:settingsServerImport').addAttachmentOption((option) =>
		applyLocalizedBuilder(option, 'commands/conf:settingsServerImportFile').setRequired(true)
	)
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'settings server import'>) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const { guildId } = interaction;
		const { file } = options;

		if (file.size > MaximumConfigurationFileSize) {
			const maximum = `${MaximumConfigurationFileSize / 1024} KiB`;
			return interaction.reply({ content: t('commands/conf:transferErrorTooLarge', { maximum }), flags: MessageFlags.Ephemeral });
		}

		// Reading the file and the guild may take longer than the three seconds an interaction waits for an answer:
		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });

		const text = await downloadConfigurationFile(file);
		if (text === null) return deferred.update({ content: t('commands/conf:transferErrorDownload') });

		const [settings, guild, rules] = await Promise.all([readSettings(guildId), resolveGuild(guildId), readAutoModerationRules(guildId)]);
		const parsed = await parseConfigurationFile(text, { settings, rules, guild, t });
		if (!parsed.ok) return deferred.update({ content: renderConfigurationIssues(parsed.issues, t) });

		const plan = planConfigurationImport(settings, rules, parsed.value);
		if (plan.isEmpty) return deferred.update({ content: t('commands/conf:transferNothing') });

		// What the file holds waits in Redis for the click, which may reach another process than this one:
		await savePendingImport(guildId, interaction.user.id, interaction.id, parsed.value);

		const embed = await renderConfigurationPreview(plan, { settings, guild, t });
		const expiresAt = new Date(Date.now() + seconds(PendingImportSeconds));
		return deferred.update({
			content: `-# ⏳ ${t('commands/conf:transferImportExpires', { time: time(expiresAt, TimestampStyles.RelativeTime) })}`,
			embeds: [embed],
			components: [renderSettingsImportButtons(t, interaction.user.id, interaction.id)]
		});
	}
}
