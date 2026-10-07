import type { ReportSubject } from '#lib/moderation/reports/pending';
import { savePendingReport } from '#lib/moderation/reports/pending';
import { renderReportModal, ReportReasonMaximumLength } from '#lib/moderation/reports/render';
import { getReportDenial, submitReport } from '#lib/moderation/reports/submit';
import { createTranslator, type GuildChatInputInteraction, type Translator } from '#lib/structures/commands/utils';
import { getTag } from '#utils/util';
import { Command, RegisterCommand, RegisterMessageCommand, RegisterUserCommand, type TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, applyNameLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationCommandType, ApplicationIntegrationType, InteractionContextType, MessageFlags, type APIUser } from 'discord-api-types/v10';

type InGuild<Interaction> = Interaction & { guildId: string };

/**
 * How many attachments of a reported message a report links to.
 */
const MaximumAttachments = 5;

/**
 * The `report` command, with which a member reports another member to the moderators. It is available as a slash
 * command and as the `Report Message` and `Report User` context menu commands.
 *
 * @remarks
 *
 * - Everybody can use it, so it has no default member permissions.
 * - The context menu commands ask for the reason in a modal, which the `report` interaction handler receives. What is
 *   reported is kept in Redis in the meantime (`lib/moderation/reports/pending`), since a modal only carries IDs back.
 * - The report is sent to the `reports.channel` setting, see `lib/moderation/reports`.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/report:name', 'commands/report:description')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.addUserOption((option) => applyLocalizedBuilder(option, 'commands/report:optionsUser').setRequired(true))
		.addStringOption((option) =>
			applyLocalizedBuilder(option, 'commands/report:optionsReason').setRequired(true).setMinLength(5).setMaxLength(ReportReasonMaximumLength)
		)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, args: { user: TransformedArguments.User; reason: string }) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const subject = this.#getSubject(args.user.user);
		const content = await submitReport(t, interaction.guildId, interaction.user.id, subject, args.reason);
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	@RegisterUserCommand((builder) =>
		applyNameLocalizedBuilder(builder, 'commands/report:contextMenuUserName')
			.setType(ApplicationCommandType.User)
			.setContexts(InteractionContextType.Guild)
			.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
	)
	public reportUser(interaction: InGuild<Command.UserInteraction>, args: TransformedArguments.User) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		return this.#askReason(interaction, t, this.#getSubject(args.user));
	}

	@RegisterMessageCommand((builder) =>
		applyNameLocalizedBuilder(builder, 'commands/report:contextMenuMessageName')
			.setType(ApplicationCommandType.Message)
			.setContexts(InteractionContextType.Guild)
			.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
	)
	public reportMessage(interaction: InGuild<Command.MessageInteraction>, args: TransformedArguments.Message) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const { message } = args;

		// A webhook is not a member, there is nobody the moderators could act on:
		if (message.webhook_id !== undefined) {
			return interaction.reply({ content: t('commands/report:targetWebhook'), flags: MessageFlags.Ephemeral });
		}

		return this.#askReason(interaction, t, {
			...this.#getSubject(message.author),
			message: {
				channelId: message.channel_id,
				id: message.id,
				content: message.content,
				attachments: message.attachments.slice(0, MaximumAttachments).map((attachment) => attachment.url)
			}
		});
	}

	/**
	 * Opens the modal for the reason of a report, once what is reported was kept for the handler of the modal.
	 */
	async #askReason(interaction: InGuild<Command.UserInteraction | Command.MessageInteraction>, t: Translator, subject: ReportSubject) {
		const denial = await getReportDenial(t, interaction.guildId, interaction.user.id, subject.targetId);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		await savePendingReport(interaction.guildId, interaction.user.id, subject);
		return interaction.showModal(renderReportModal(t, subject));
	}

	#getSubject(user: APIUser): ReportSubject {
		return { targetId: user.id, targetTag: getTag(user), message: null };
	}
}
