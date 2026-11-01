import { decodeAppealListId, fetchAppealListPage, isAppealListFilter, renderAppealList } from '#lib/moderation/appealList';
import { ApplyOptions } from '@wolfstar/decorators';
import { InteractionHandler, ModalSubmitInteraction } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT, type AnyNamespace, type TFunction } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';

type ComponentInteraction = Exclude<InteractionHandler.Interaction, InteractionHandler.ModalInteraction>;

/**
 * Handles the select menu and the buttons of `/appeal list`, see `lib/moderation/appealList.ts`: what a click does is
 * read from its custom ID, so there is nothing to keep between the clicks.
 */
@ApplyOptions<InteractionHandler.Options>({ preconditions: ['appealManager'] })
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const { guildId } = interaction;
		const action = decodeAppealListId(content);
		if (action === null || guildId === undefined || interaction instanceof ModalSubmitInteraction) {
			return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });
		}

		const component = interaction as ComponentInteraction;
		const selected = 'values' in component.data ? component.data.values[0] : undefined;
		const filter = isAppealListFilter(selected) ? selected : action.filter;

		const t = getSupportedUserLanguageT(interaction) as unknown as TFunction<AnyNamespace>;
		const page = await fetchAppealListPage(t, guildId, filter, action.page);
		return component.update(renderAppealList(page));
	}
}
