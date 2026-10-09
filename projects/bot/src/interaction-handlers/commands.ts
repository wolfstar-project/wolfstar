import {
	AllCategoriesValue,
	CommandsPageInputId,
	CommandsSearchInputId,
	createCommandsMenuContext,
	decodeCommandsMenuId,
	normalizeCommandQuery,
	renderCommand,
	renderCommandsList,
	renderCommandsPageModal,
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

		// Only the modals are submitted, everything else is a click:
		if (interaction instanceof ModalSubmitInteraction) {
			const modal = interaction as ModalInteraction;
			const context = await createCommandsMenuContext(modal, action.ownerId);

			if (action.verb === 'query') {
				const query = normalizeCommandQuery(getModalValue(modal.data.components, CommandsSearchInputId) ?? '');
				return modal.update(renderCommandsResults(context, query, 0));
			}

			if (action.verb === 'goto') {
				const page = Number.parseInt(getModalValue(modal.data.components, CommandsPageInputId) ?? '', 10);
				if (!Number.isSafeInteger(page) || page < 1) return fail(t('commands/commands:gotoInvalid'));

				// A page past the last one is the last one, the pages are numbered from 1 for the user:
				const [kind, ...rest] = action.target.split('/');
				const target = rest.join('/');
				return modal.update(
					kind === 'results' ? renderCommandsResults(context, target, page - 1) : renderCommandsList(context, target, page - 1)
				);
			}

			return fail(getDefaultExpiredReply());
		}

		const component = interaction as ComponentInteraction;
		switch (action.verb) {
			case 'search':
				return component.showModal(renderCommandsSearchModal(t, action.ownerId));
			case 'jump':
				return component.showModal(renderCommandsPageModal(t, action.ownerId, action.target));
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
				// The target is the category the list was in and the path of the entry, `Tools/whois user`, of which the command is the first word:
				const [category, ...rest] = action.target.split('/');
				const [name] = rest.join('/').split(' ');
				const command = context.commands.find((entry) => entry.name === name);
				// A command that was removed since the menu was opened:
				return component.update(
					command ? renderCommand(context, command, { category, page: action.page }) : renderCommandsList(context, '', 0)
				);
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
