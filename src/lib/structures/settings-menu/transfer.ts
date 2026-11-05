import { readSettings, writeSettingsTransaction } from '#lib/database/settings';
import { ConfigurationFileName, createConfigurationFile } from '#lib/database/settings/transfer/format';
import { downloadConfigurationFile } from '#lib/database/settings/transfer/attachment';
import { parseConfigurationFile } from '#lib/database/settings/transfer/parse';
import { getPlannedSettings, planConfigurationImport } from '#lib/database/settings/transfer/plan';
import { ActionRowBuilder, ButtonBuilder, FileUploadBuilder, LabelBuilder, ModalBuilder, TextInputBuilder } from '@discordjs/builders';
import type { TFunction } from '@sapphire/plugin-i18next';
import { container } from '@sapphire/framework';
import { ButtonStyle, ComponentType, MessageFlags, PermissionFlagsBits, TextInputStyle, type ButtonInteraction, type Guild } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export async function exportSettings(interaction: ButtonInteraction, t: TFunction) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	const settings = await readSettings(interaction.guild!);
	await interaction.editReply({
		content: t('commands/conf:transferDescription'),
		files: [{ attachment: Buffer.from(JSON.stringify(createConfigurationFile(settings), null, 2)), name: ConfigurationFileName }]
	});
}

export async function importSettings(interaction: ButtonInteraction, t: TFunction) {
	const id = `conf-import-${randomUUID()}`;
	await interaction.showModal(
		new ModalBuilder()
			.setCustomId(id)
			.setTitle(t('commands/conf:transferImport'))
			.addLabelComponents(
				new LabelBuilder()
					.setLabel(t('commands/conf:transferImportFile'))
					.setFileUploadComponent(new FileUploadBuilder().setCustomId('file').setMaxValues(1).setRequired(false)),
				new LabelBuilder()
					.setLabel(t('commands/conf:transferImportText'))
					.setTextInputComponent(
						new TextInputBuilder().setCustomId('json').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(4000)
					)
			)
	);
	const submission = await interaction
		.awaitModalSubmit({ time: 300_000, filter: (event) => event.customId === id && event.user.id === interaction.user.id })
		.catch((error: unknown) => {
			if (isCollectorTimeout(error)) return null;
			throw error;
		});
	if (!submission) return;
	await submission.deferReply({ flags: MessageFlags.Ephemeral });
	try {
		const guild = interaction.guild!;
		if (!(await canImport(guild, interaction.user.id))) {
			await submission.editReply(t('commands/conf:transferPermission'));
			return;
		}
		const attachment = submission.fields.getUploadedFiles('file')?.first();
		const text = attachment ? await downloadConfigurationFile(attachment) : submission.fields.getTextInputValue('json');
		if (!text) {
			await submission.editReply(t('commands/conf:transferErrorDownload'));
			return;
		}
		const settings = await readSettings(guild);
		const parsed = await parseConfigurationFile(text, { settings, guild, t });
		if (!parsed.ok) {
			await submission.editReply({
				content: parsed.issues
					.map((issue) => `${issue.path}: ${issue.message}`)
					.join('\n')
					.slice(0, 1900),
				allowedMentions: { parse: [] }
			});
			return;
		}
		const plan = planConfigurationImport(settings, parsed.value);
		if (!plan.length) {
			await submission.editReply(t('commands/conf:transferNoChanges'));
			return;
		}
		const preview = await submission.editReply({
			content: t('commands/conf:transferPreview', { count: plan.length }),
			files: [
				{
					attachment: Buffer.from(
						JSON.stringify(
							plan.map(({ name, before, after }) => ({ name, before, after })),
							null,
							2
						)
					),
					name: 'wolfstar-settings-changes.json'
				}
			],
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder().setCustomId(`${id}-confirm`).setLabel(t('commands/conf:transferConfirm')).setStyle(ButtonStyle.Primary),
					new ButtonBuilder().setCustomId(`${id}-cancel`).setLabel(t('globals:cancel')).setStyle(ButtonStyle.Secondary)
				)
			]
		});
		const confirmation = await preview
			.awaitMessageComponent({
				componentType: ComponentType.Button,
				time: 300_000,
				filter: (event) => event.user.id === interaction.user.id && [`${id}-confirm`, `${id}-cancel`].includes(event.customId)
			})
			.catch((error: unknown) => {
				if (isCollectorTimeout(error)) return null;
				throw error;
			});
		if (confirmation) await confirmation.deferUpdate();
		let content = t('commands/conf:transferCancelled');
		if (confirmation?.customId === `${id}-confirm`) {
			if (!(await canImport(guild, interaction.user.id))) content = t('commands/conf:transferPermission');
			else {
				using trx = await writeSettingsTransaction(guild);
				const validated = await parseConfigurationFile(text, { settings: trx.settings, guild, t });
				if (!validated.ok || !isDeepStrictEqual(plan, planConfigurationImport(trx.settings, validated.value)))
					content = t('commands/conf:transferStale');
				else {
					await trx.write(getPlannedSettings(plan)).submitWithAudit(interaction.user.id);
					content = t('commands/conf:transferApplied', { count: plan.length });
				}
			}
		}
		await submission.editReply({ content, components: [], attachments: [] });
	} catch (error) {
		container.logger.error('[Settings import]', error);
		await submission.editReply({ content: t('commands/conf:transferErrorImport'), components: [], attachments: [] });
	}
}

async function canImport(guild: Guild, userId: string) {
	const member = await guild.members.fetch({ user: userId, force: true });
	return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function isCollectorTimeout(error: unknown) {
	return error instanceof Error && error.name.includes('InteractionCollectorError');
}
