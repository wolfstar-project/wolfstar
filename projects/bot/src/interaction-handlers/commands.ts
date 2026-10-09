import { readSettings, writeSettings } from '#lib/database';
import {
	AllCategoriesValue,
	CommandDisabledValue,
	CommandStatusInputId,
	CommandsPageInputId,
	CommandsSearchInputId,
	createCommandsMenuContext,
	decodeCommandsMenuId,
	normalizeCommandQuery,
	renderCommandEditModal,
	renderCommandsList,
	renderCommandsPageModal,
	renderCommandsResults,
	renderCommandsSearchModal
} from '#lib/structures/commands-menu';
import { findCommandPiece, findDisabledBy, ProtectedCommands } from '#lib/structures/commands-menu/disabled';
import { CommandPermissionLevel, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
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

			if (action.verb === 'save') return this.save(modal, action.target, t);

			return fail(getDefaultExpiredReply());
		}

		const component = interaction as ComponentInteraction;
		switch (action.verb) {
			case 'search':
				return component.showModal(renderCommandsSearchModal(t, action.ownerId));
			case 'jump':
				return component.showModal(renderCommandsPageModal(t, action.ownerId, action.target));
			case 'edit':
				return this.edit(component, action.ownerId, action.target, t);
			case 'list':
			case 'category':
			case 'results':
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
		}
	}

	/**
	 * Opens the modal that edits a command, to the administrators of the server.
	 *
	 * @param interaction - The click on the button of the command.
	 * @param ownerId - The user who opened the menu.
	 * @param path - The path of the entry the button is of, `whois user`, of which the command is the first word.
	 * @param t - The function to translate with.
	 */
	private async edit(interaction: ComponentInteraction, ownerId: string, path: string, t: ReturnType<typeof createTranslator>) {
		const denial = await this.getDenial(interaction, t);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const context = await createCommandsMenuContext(interaction, ownerId);
		const [name] = path.split(' ');
		const command = context.commands.find((entry) => entry.name === name);
		const piece = command === undefined ? null : findCommandPiece(command.name);
		// A command that was removed since the menu was opened:
		if (command === undefined || piece === null) return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });

		const settings = await readSettings(interaction.guildId!);
		return interaction.showModal(renderCommandEditModal(context, command, findDisabledBy(settings.commandsDisabled, piece)));
	}

	/**
	 * Enables or disables a command in the server: it adds the command to `commands.disabled`, or takes it out.
	 *
	 * @param interaction - The submission of the modal of the command.
	 * @param name - The name of the command.
	 * @param t - The function to translate with.
	 */
	private async save(interaction: ModalInteraction, name: string, t: ReturnType<typeof createTranslator>) {
		const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
		const denial = await this.getDenial(interaction, t);
		if (denial !== null) return reply(denial);

		const piece = findCommandPiece(name);
		if (piece === null) return reply(getDefaultExpiredReply());

		const disable = getModalValue(interaction.data.components, CommandStatusInputId) === CommandDisabledValue;
		if (disable && ProtectedCommands.has(piece.name)) return reply(t('commands/commands:editProtected', { name }));

		const guildId = interaction.guildId!;
		await writeSettings(
			guildId,
			(settings) => {
				const others = settings.commandsDisabled.filter((entry: string) => entry !== piece.name);
				return { commandsDisabled: disable ? [...others, piece.name] : others };
			},
			interaction.user.id
		);

		if (disable) return reply(t('commands/commands:editDisabledDone', { name }));

		// The command can still be disabled by its category or by `*`, which this does not take out:
		const settings = await readSettings(guildId);
		const rule = findDisabledBy(settings.commandsDisabled, piece);
		return reply(rule === null ? t('commands/commands:editEnabledDone', { name }) : t('commands/commands:editStillDisabled', { name, rule }));
	}

	/**
	 * Reads whether the author of an interaction is not allowed to edit the commands of the server.
	 *
	 * @returns The reason, `null` when they are an administrator.
	 */
	private async getDenial(interaction: InteractionHandler.Interaction, t: ReturnType<typeof createTranslator>) {
		const { guildId, member } = interaction;
		if (guildId === undefined || member === undefined) return getDefaultExpiredReply();
		if (await hasCommandPermissionLevel({ guildId, member }, CommandPermissionLevel.Administrator)) return null;

		return t('preconditions:administrator', { command: { name: 'commands' } });
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
