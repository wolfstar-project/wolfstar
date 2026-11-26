import type { ModerationManager } from '#lib/moderation';
import {
	decodeCaseListFilter,
	decodeCaseListTarget,
	decodeCaseMenuCaseId,
	decodeCaseMenuId,
	renderCaseDeletePrompt,
	renderCaseList,
	renderCaseView,
	type CaseMenuAction
} from '#lib/structures/case-menu';
import { getModeration } from '#utils/functions';
import { renderStatus } from '#utils/status';
import { ApplyOptions } from '@wolfstar/decorators';
import { InteractionHandler, ModalSubmitInteraction } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedLanguageT, getSupportedUserLanguageT, type AnyNamespace, type TFunction } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';

type ModalInteraction = InteractionHandler.ModalInteraction;
type ComponentInteraction = Exclude<InteractionHandler.Interaction, ModalInteraction>;

/**
 * Handles the components of the case menu `/case list` and `/case view` answer with, see `lib/structures/case-menu`.
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
		if (interaction instanceof ModalSubmitInteraction) return interaction.reply(renderStatus('error', getDefaultExpiredReply()));

		const component = interaction as ComponentInteraction;
		if (action.verb === 'list' || action.verb === 'filter') return this.list(component, guildId, action);

		const caseId = decodeCaseMenuCaseId(action.target);
		const moderation = await getModeration(guildId);
		const entry = caseId === null ? null : await moderation.fetch(caseId);
		if (entry === null) return component.reply(renderStatus('error', t('arguments:caseUnknownEntry', { parameter: action.target })));

		switch (action.verb) {
			case 'view':
				// A case is opened in a message of its own, which only the moderator sees, so the list stays as it is:
				return component.reply(renderCaseView({ t, ownerId: action.ownerId, ephemeral: true }, entry));
			case 'delete':
				return component.update(renderCaseDeletePrompt(this.getViewContext(component, action), entry.id));
			case 'deleteCancel':
				return component.update(renderCaseView(this.getViewContext(component, action), entry));
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
	 * The context a message of the menu is rendered again with: a message everybody sees is in the language of the
	 * guild, as it was sent, and one only the moderator sees in theirs.
	 */
	private getViewContext(interaction: ComponentInteraction, action: CaseMenuAction) {
		const ephemeral = ((interaction.message.flags ?? 0) & MessageFlags.Ephemeral) !== 0;
		const t = (ephemeral ? getSupportedUserLanguageT(interaction) : getSupportedLanguageT(interaction)) as unknown as TFunction<AnyNamespace>;
		return { t, ownerId: action.ownerId, ephemeral };
	}
}
