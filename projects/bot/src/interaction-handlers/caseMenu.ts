import { readSettings } from '#lib/database';
import type { ModerationManager } from '#lib/moderation';
import { closeCase, editCase, resolveCaseDuration, type CaseEditOutcome } from '#lib/moderation/caseEdits';
import {
	CaseInputIds,
	decodeCaseListFilter,
	decodeCaseListTarget,
	decodeCaseMenuCaseId,
	decodeCaseMenuId,
	fetchCaseViewDetails,
	renderCaseCloseModal,
	renderCaseDeletePrompt,
	renderCaseEditModal,
	renderCaseHistory,
	renderCaseList,
	renderCaseView,
	type CaseMenuAction
} from '#lib/structures/case-menu';
import { getModeration } from '#utils/functions';
import { renderStatus } from '#utils/status';
import { ApplyOptions } from '@wolfstar/decorators';
import { container, InteractionHandler, ModalSubmitInteraction } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedLanguageT, getSupportedUserLanguageT, type AnyNamespace, type TFunction } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';
import { fetchModerationCaseData, fetchModerationCaseEdits } from 'wolfstar-database';
import { getModalChecked, getModalValue, getModalValues, hasModalComponent } from 'wolfstar-shared';

type ModalInteraction = InteractionHandler.ModalInteraction;
type ComponentInteraction = Exclude<InteractionHandler.Interaction, ModalInteraction>;

/**
 * Handles the components and the modals of the case menu `/case list` and `/case view` answer with, see
 * `lib/structures/case-menu`.
 *
 * @remarks What a component does is read from its custom ID, so there is no state to keep between the clicks. Only the
 * moderator who opened the menu can use it.
 */
@ApplyOptions<InteractionHandler.Options>({ preconditions: ['moderator'] })
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const { guildId } = interaction;
		const action = decodeCaseMenuId(content);
		if (action === null || guildId === undefined) return interaction.reply(renderStatus('error', getDefaultExpiredReply()));

		const t = getSupportedUserLanguageT(interaction) as unknown as TFunction<AnyNamespace>;
		if (interaction.user.id !== action.ownerId) return interaction.reply(renderStatus('error', t('commands/case:menuWrongUser')));

		const isModal = interaction instanceof ModalSubmitInteraction;
		if (!isModal && (action.verb === 'list' || action.verb === 'filter')) {
			return this.list(interaction as ComponentInteraction, guildId, action);
		}

		const caseId = decodeCaseMenuCaseId(action.target);
		const moderation = await getModeration(guildId);
		const entry = caseId === null ? null : await moderation.fetch(caseId);
		if (entry === null) return interaction.reply(renderStatus('error', t('arguments:caseUnknownEntry', { parameter: action.target })));

		// Only the modals are submitted, everything else is a click:
		if (isModal) {
			const modal = interaction as ModalInteraction;
			if (action.verb === 'editSubmit') return this.edit(modal, action, entry, t);
			if (action.verb === 'closeSubmit') return this.close(modal, action, entry, t);
			return modal.reply(renderStatus('error', getDefaultExpiredReply()));
		}

		const component = interaction as ComponentInteraction;
		switch (action.verb) {
			case 'view':
				// A case is opened in a message of its own, which only the moderator sees, so the list stays as it is:
				return component.reply(
					renderCaseView({ t, ownerId: action.ownerId, ephemeral: true }, entry, await fetchCaseViewDetails(guildId, entry.id))
				);
			case 'edit': {
				const stored = await fetchModerationCaseData(container.prisma.orm, guildId, entry.id);
				return component.showModal(
					renderCaseEditModal({ t, ownerId: action.ownerId }, entry, stored?.staffNote ?? null, await this.getNotifyDefault(guildId))
				);
			}
			case 'close':
				if (entry.isArchived()) return component.reply(renderStatus('info', t('commands/case:closeAlready', { caseId: entry.id })));
				return component.showModal(renderCaseCloseModal({ t, ownerId: action.ownerId }, entry.id, await this.getNotifyDefault(guildId)));
			case 'history': {
				const edits = await fetchModerationCaseEdits(container.prisma.orm, guildId, entry.id);
				return component.reply(
					edits.length === 0
						? renderStatus('info', t('commands/case:historyEmpty', { caseId: entry.id }))
						: renderCaseHistory(t, entry.id, edits)
				);
			}
			case 'delete':
				return component.update(renderCaseDeletePrompt(this.getViewContext(component, action), entry.id));
			case 'deleteCancel':
				return component.update(await this.renderView(component, action, entry));
			case 'deleteConfirm':
				return this.delete(component, moderation, entry, t);
			default:
				return component.reply(renderStatus('error', getDefaultExpiredReply()));
		}
	}

	/**
	 * Shows a page of the list again, with what the click asked for: another page, another filter, or the same page
	 * read again.
	 */
	private async list(interaction: ComponentInteraction, guildId: string, action: CaseMenuAction) {
		const shown = decodeCaseListTarget(action.target);
		if (shown === null) return interaction.reply(renderStatus('error', getDefaultExpiredReply()));

		const selected = 'values' in interaction.data ? interaction.data.values[0] : undefined;
		const filter = action.verb === 'filter' ? (decodeCaseListFilter(selected) ?? shown.filter) : shown.filter;

		const moderation = await getModeration(guildId);
		const entries = await moderation.fetch({ userId: shown.userId ?? undefined });
		return interaction.update(
			renderCaseList(this.getViewContext(interaction, action), { filter, userId: shown.userId, page: action.page }, [...entries.values()])
		);
	}

	/**
	 * Edits a case with what its modal brought, shows the case again, and tells the moderator how it went.
	 */
	private async edit(interaction: ModalInteraction, action: CaseMenuAction, entry: ModerationManager.Entry, t: TFunction<AnyNamespace>) {
		const { components } = interaction.data;

		let duration: number | null | undefined;
		try {
			duration = resolveCaseDuration(t, entry, getModalValue(components, CaseInputIds.Duration));
		} catch (error) {
			if (typeof error === 'string') return interaction.reply(renderStatus('error', error));
			throw error;
		}

		const [attachmentId] = getModalValues(components, CaseInputIds.Proof);
		const proof = attachmentId === undefined ? undefined : interaction.data.resolved?.attachments?.[attachmentId];

		// The proof is downloaded and sent again, which may take longer than Discord waits for an answer:
		const deferred = await interaction.deferUpdate();
		const outcome = await editCase({
			entry,
			moderatorId: interaction.user.id,
			t,
			values: {
				reason: getModalValue(components, CaseInputIds.Reason)?.trim() || null,
				// A modal that was opened for a case with no duration has no such field:
				...(duration === undefined ? {} : { duration }),
				...(hasModalComponent(components, CaseInputIds.StaffNote)
					? { staffNote: getModalValue(components, CaseInputIds.StaffNote)?.trim() || null }
					: {})
			},
			proof,
			notify: getModalChecked(components, CaseInputIds.Notify) ?? false
		});

		await deferred.update(await this.renderView(interaction, action, entry));
		return interaction.followup(this.renderOutcome(t, outcome, 'commands/case:editSuccess', 'commands/case:editUnchanged', entry.id));
	}

	/**
	 * Closes a case with what its modal brought, shows the case again, and tells the moderator how it went.
	 */
	private async close(interaction: ModalInteraction, action: CaseMenuAction, entry: ModerationManager.Entry, t: TFunction<AnyNamespace>) {
		const { components } = interaction.data;
		const deferred = await interaction.deferUpdate();
		const outcome = await closeCase({
			entry,
			moderatorId: interaction.user.id,
			t,
			reason: getModalValue(components, CaseInputIds.Reason)?.trim() || null,
			notify: getModalChecked(components, CaseInputIds.Notify) ?? false
		});

		await deferred.update(await this.renderView(interaction, action, entry));
		return interaction.followup(this.renderOutcome(t, outcome, 'commands/case:archiveSuccess', 'commands/case:closeAlready', entry.id));
	}

	/**
	 * Deletes a case, and tells so in place of the case.
	 */
	private async delete(
		interaction: ComponentInteraction,
		moderation: ModerationManager,
		entry: ModerationManager.Entry,
		t: TFunction<AnyNamespace>
	) {
		await moderation.delete(entry);
		return interaction.update(renderStatus('success', t('commands/case:deleteSuccess', { caseId: entry.id })));
	}

	/**
	 * What the moderator is told after an edit: that it worked, with what could not be done, or that nothing changed.
	 */
	private renderOutcome(
		t: TFunction<AnyNamespace>,
		outcome: CaseEditOutcome,
		successKey: 'commands/case:editSuccess' | 'commands/case:archiveSuccess',
		unchangedKey: 'commands/case:editUnchanged' | 'commands/case:closeAlready',
		caseId: number
	) {
		const text = t(outcome.changes.length === 0 ? unchangedKey : successKey, { caseId });
		if (outcome.warnings.length > 0) return renderStatus('warning', [text, ...outcome.warnings].join('\n'));
		return renderStatus(outcome.changes.length === 0 ? 'info' : 'success', text);
	}

	/**
	 * Renders the case of a message of the menu again, with what the moderators added to it when only they see it.
	 */
	private async renderView(interaction: InteractionHandler.Interaction, action: CaseMenuAction, entry: ModerationManager.Entry) {
		const context = this.getViewContext(interaction, action);
		return renderCaseView(context, entry, context.ephemeral ? await fetchCaseViewDetails(entry.guild.id, entry.id) : null);
	}

	/**
	 * Whether the checkbox that tells the user starts ticked: as the server does for the cases it makes.
	 */
	private async getNotifyDefault(guildId: string) {
		const settings = await readSettings(guildId);
		return settings.messagesModerationDm;
	}

	/**
	 * The context a message of the menu is rendered again with: a message everybody sees is in the language of the
	 * guild, as it was sent, and one only the moderator sees in theirs.
	 */
	private getViewContext(interaction: InteractionHandler.Interaction, action: CaseMenuAction) {
		const flags = ('message' in interaction ? interaction.message?.flags : undefined) ?? 0;
		const ephemeral = (flags & MessageFlags.Ephemeral) !== 0;
		const t = (ephemeral ? getSupportedUserLanguageT(interaction) : getSupportedLanguageT(interaction)) as unknown as TFunction<AnyNamespace>;
		return { t, ownerId: action.ownerId, ephemeral };
	}
}
