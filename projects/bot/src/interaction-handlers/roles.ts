import { createTranslator } from '#lib/structures/commands/utils';
import {
	createRolesMenuContext,
	decodeRolesMenuId,
	renderRolesList,
	renderRolesPageModal,
	renderRolesPicker,
	renderRoleView,
	RolesPageInputId
} from '#lib/structures/roles-menu';
import { getModalValue } from '#utils/interactions';
import { InteractionHandler, ModalSubmitInteraction } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';

type ModalInteraction = InteractionHandler.ModalInteraction;
type ComponentInteraction = Exclude<InteractionHandler.Interaction, ModalInteraction>;

/**
 * Handles the components and the modal of the roles menu `/roles browse` opens, see `lib/structures/roles-menu`.
 *
 * @remarks What a component does is read from its custom ID, so there is no state to keep between the clicks. Only the
 * user who opened the menu can use it.
 */
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const { guildId } = interaction;
		const action = decodeRolesMenuId(content);
		const fail = (message: string) => interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
		if (action === null || guildId === undefined) return fail(getDefaultExpiredReply());

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		if (interaction.user.id !== action.ownerId) return fail(t('commands/management:rolesBrowseWrongUser'));

		// The modal of the page is the only thing that is submitted, everything else is a click:
		if (interaction instanceof ModalSubmitInteraction) {
			if (action.verb !== 'goto') return fail(getDefaultExpiredReply());

			const modal = interaction as ModalInteraction;
			const page = Number.parseInt(getModalValue(modal.data.components, RolesPageInputId) ?? '', 10);
			if (!Number.isSafeInteger(page) || page < 1) return fail(t('commands/management:rolesBrowseGotoInvalid'));

			// A page past the last one is the last one, the pages are numbered from 1 for the user:
			const context = await createRolesMenuContext(modal, guildId, action.ownerId);
			return modal.update(renderRolesList(context, page - 1));
		}

		const component = interaction as ComponentInteraction;
		if (action.verb === 'jump') return component.showModal(renderRolesPageModal(t, action.ownerId));

		const context = await createRolesMenuContext(component, guildId, action.ownerId);
		switch (action.verb) {
			case 'list':
				return component.update(renderRolesList(context, action.page));
			case 'pick':
				return component.update(renderRolesPicker(context, action.page));
			case 'select': {
				const roleId = this.getSelectedRole(component);
				const role = context.roles.find((entry) => entry.id === roleId);
				// A role that was deleted since the menu was opened:
				if (role === undefined) return component.update(renderRolesList(context, action.page));
				return component.update(renderRoleView(context, role, action.page));
			}
			default:
				return fail(getDefaultExpiredReply());
		}
	}

	/**
	 * The role picked in the select menu of the roles.
	 */
	private getSelectedRole(interaction: ComponentInteraction) {
		const { data } = interaction;
		return 'values' in data ? (data.values[0] ?? null) : null;
	}
}
