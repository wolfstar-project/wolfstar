import {
	AllCategoriesValue,
	CommandsSearchInputId,
	createCommandsMenuContext,
	decodeCommandsMenuId,
	normalizeCommandQuery,
	renderCommand,
	renderCommandsList,
	renderCommandsResults,
	renderCommandsSearchModal
} from '#lib/structures/commands-menu';
import { createTranslator } from '#lib/structures/commands/utils';
import { getModalValue } from '#utils/interactions';
import { InteractionHandler, ModalSubmitInteraction } from '@wolfstar/http-framework';
import { getDefaultExpiredReply, isMessageStringSelectInteractionData } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';

type ModalInteraction = InteractionHandler.ModalInteraction;
type ComponentInteraction = Exclude<InteractionHandler.Interaction, ModalInteraction>;

/**
 * Handles the components and the modal of the commands menu the `commands` command opens, see
 * `lib/structures/commands-menu`.
 *
 * @remarks What a component does is read from its custom ID, so there is no state to keep between the clicks. Only the
 * user who opened the menu can use it.
 */
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const action = decodeCommandsMenuId(content);
		const fail = (message: string) => interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
		if (action === null) return fail(getDefaultExpiredReply());

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		if (interaction.user.id !== action.ownerId) return fail(t('commands/commands:menuWrongUser'));

		// The modal of the search is the only thing that is submitted, everything else is a click:
		if (interaction instanceof ModalSubmitInteraction) {
			if (action.verb !== 'query') return fail(getDefaultExpiredReply());

			const modal = interaction as ModalInteraction;
			const query = normalizeCommandQuery(getModalValue(modal.data.components, CommandsSearchInputId) ?? '');
			const context = await createCommandsMenuContext(modal, action.ownerId);
			return modal.update(renderCommandsResults(context, query, 0));
		}

		const component = interaction as ComponentInteraction;
		switch (action.verb) {
			case 'search':
				return component.showModal(renderCommandsSearchModal(t, action.ownerId));
			case 'page':
				return component.deferUpdate();
			case 'list':
			case 'category':
			case 'results':
			case 'view':
				break;
			default:
				return fail(getDefaultExpiredReply());
		}

		const context = await createCommandsMenuContext(component, action.ownerId);
		switch (action.verb) {
			case 'list':
				return component.update(renderCommandsList(context, action.target, action.page));
			case 'category':
				return component.update(renderCommandsList(context, this.getCategory(component), 0));
			case 'results':
				return component.update(renderCommandsResults(context, normalizeCommandQuery(action.target), action.page));
			case 'view': {
				const command = context.commands.find((entry) => entry.name === action.target);
				// A command that was removed since the menu was opened:
				return component.update(command ? renderCommand(context, command) : renderCommandsList(context, '', 0));
			}
		}
	}

	/**
	 * The category picked in the category select menu, empty for every command.
	 */
	private getCategory(interaction: ComponentInteraction) {
		const { data } = interaction;
		const value = isMessageStringSelectInteractionData(data) ? data.values[0] : undefined;
		return value === undefined || value === AllCategoriesValue ? '' : value;
	}
}
