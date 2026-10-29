import { getLegacyPermissions, getLegacyPermissionRevision, keepDashboardAccessEntries } from '#lib/structures/commands-menu/legacy';
import { readSettings, writeSettingsTransaction } from '#lib/database';
import {
	AllCategoriesValue,
	CommandDisabledValue,
	CommandStatusInputId,
	CommandsPageInputId,
	CommandsSearchInputId,
	createCommandsMenuContext,
	decodeCommandsMenuId,
	getCommandMembersInputId,
	normalizeCommandQuery,
	renderCommandEditModal,
	renderClearLegacyModal,
	renderLegacyPermissionButtons,
	renderCommandsList,
	renderCommandsPageModal,
	renderCommandsResults,
	renderCommandsSearchModal
} from '#lib/structures/commands-menu';
import { findCommandPiece, findDisabledBy, ProtectedCommands } from '#lib/structures/commands-menu/disabled';
import {
	CommandChannelLists,
	CommandMemberRules,
	findCommandRestriction,
	getCommandRestrictionRevision,
	isCommandRestrictionEmpty,
	keepHiddenRestrictionEntries,
	readCommandRestrictions,
	setCommandMembers,
	setCommandRestriction,
	type CommandMemberRule,
	type CommandRestriction
} from '#lib/structures/commands-menu/restrictions';
import { canManageServerSettingsFrom } from '#lib/structures/commands/permissions';
import { createTranslator } from '#lib/structures/commands/utils';
import { getModalValue, getModalValues } from 'wolfstar-shared';
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

			if (action.verb === 'query') {
				const context = await createCommandsMenuContext(modal, action.ownerId, { legacy: true });
				const query = normalizeCommandQuery(getModalValue(modal.data.components, CommandsSearchInputId) ?? '');
				return modal.update(renderCommandsResults(context, query, 0));
			}

			if (action.verb === 'goto') {
				const page = Number.parseInt(getModalValue(modal.data.components, CommandsPageInputId) ?? '', 10);
				if (!Number.isSafeInteger(page) || page < 1) return fail(t('commands/commands:gotoInvalid'));
				const context = await createCommandsMenuContext(modal, action.ownerId, { legacy: true });

				// A page past the last one is the last one, the pages are numbered from 1 for the user:
				const [kind, ...rest] = action.target.split('/');
				const target = rest.join('/');
				return modal.update(
					kind === 'results' ? renderCommandsResults(context, target, page - 1) : renderCommandsList(context, target, page - 1)
				);
			}

			if (action.verb === 'save') return this.save(modal, action.target, action.page, t);
			if (action.verb === 'confirmLegacy') return this.clearLegacy(modal, action.page, t);

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
			case 'legacy':
				return this.legacy(component, t);
			case 'clearLegacy': {
				const denial = await this.getLegacyOwnerDenial(component, t);
				if (denial !== null) return fail(denial);
				return component.showModal(renderClearLegacyModal({ t, ownerId: action.ownerId }, action.page));
			}
			case 'list':
			case 'category':
			case 'results':
				break;
			default:
				return fail(getDefaultExpiredReply());
		}

		const context = await createCommandsMenuContext(component, action.ownerId, { legacy: true });
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
		const restriction = findCommandRestriction(readCommandRestrictions(settings.commandsRestrictions), piece.name);
		const revision = getCommandRestrictionRevision(restriction, settings.commandsDisabled.includes(piece.name));
		return interaction.showModal(
			renderCommandEditModal(context, command, findDisabledBy(settings.commandsDisabled, piece), restriction, revision)
		);
	}

	/**
	 * Enables or disables a command in the server: it adds the command to `commands.disabled`, or takes it out. It also
	 * saves the channels and the roles the command is allowed in, or ignores, see `CommandRestriction`.
	 *
	 * @param interaction - The submission of the modal of the command.
	 * @param name - The name of the command.
	 * @param revision - The revision of the command the modal was opened with, see `getCommandRestrictionRevision`.
	 * @param t - The function to translate with.
	 */
	private async save(interaction: ModalInteraction, name: string, revision: number, t: ReturnType<typeof createTranslator>) {
		const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
		const denial = await this.getDenial(interaction, t);
		if (denial !== null) return reply(denial);

		const piece = findCommandPiece(name);
		if (piece === null) return reply(getDefaultExpiredReply());

		const selectedStatus = getModalValue(interaction.data.components, CommandStatusInputId);
		if (selectedStatus !== CommandDisabledValue && selectedStatus !== 'enabled') return reply(getDefaultExpiredReply());
		const disable = selectedStatus === CommandDisabledValue;
		if (disable && ProtectedCommands.has(piece.name)) return reply(t('commands/commands:editProtected', { name }));

		const channels = findCommandRestriction([], piece.name);
		for (const list of CommandChannelLists) channels[list] = getModalValues(interaction.data.components, list);
		const members = this.readMembers(interaction);
		let restriction = channels;
		for (const rule of CommandMemberRules) restriction = setCommandMembers(restriction, rule, members[rule]);
		if (!isCommandRestrictionEmpty(restriction) && ProtectedCommands.has(piece.name)) {
			return reply(t('commands/commands:editProtectedRestricted', { name }));
		}

		const guildId = interaction.guildId!;
		const saved = await this.write(guildId, piece.name, disable, channels, members, revision, interaction.user.id);
		if (!saved) return reply(t('commands/commands:editStale', { name }));

		const restrictions = t('commands/commands:editRestrictionsSaved');
		if (disable) return reply(`${t('commands/commands:editDisabledDone', { name })}\n${restrictions}`);

		// The command can still be disabled by its category or by `*`, which this does not take out:
		const settings = await readSettings(guildId);
		const rule = findDisabledBy(settings.commandsDisabled, piece);
		const status = rule === null ? t('commands/commands:editEnabledDone', { name }) : t('commands/commands:editStillDisabled', { name, rule });
		return reply(`${status}\n${restrictions}`);
	}

	/**
	 * Reads the roles and the users each rule picked: a select menu of both returns their IDs, and the data of the
	 * interaction says which is which. An ID it does not resolve is neither, and is left out.
	 */
	private readMembers(interaction: ModalInteraction) {
		const { resolved } = interaction.data;
		const members = {} as Record<CommandMemberRule, { roles: string[]; users: string[] }>;
		for (const rule of CommandMemberRules) {
			const ids = getModalValues(interaction.data.components, getCommandMembersInputId(rule));
			members[rule] = {
				roles: ids.filter((id) => resolved?.roles?.[id] !== undefined),
				users: ids.filter((id) => resolved?.users?.[id] !== undefined)
			};
		}
		return members;
	}

	/**
	 * Writes the status and the restriction of a command, on the settings the database has.
	 *
	 * @returns Whether it was written: not when another administrator saved the command since the modal was opened,
	 * since the modal would undo what they saved.
	 */
	private async write(
		guildId: string,
		command: string,
		disable: boolean,
		channels: CommandRestriction,
		members: Record<CommandMemberRule, { roles: string[]; users: string[] }>,
		revision: number,
		actorId: string
	) {
		using trx = await writeSettingsTransaction(guildId);
		const { settings } = trx;
		const stored = findCommandRestriction(readCommandRestrictions(settings.commandsRestrictions), command);
		if (getCommandRestrictionRevision(stored, settings.commandsDisabled.includes(command)) !== revision) return false;

		const others = settings.commandsDisabled.filter((entry: string) => entry !== command);
		let picked = keepHiddenRestrictionEntries(channels, stored, CommandChannelLists);
		for (const rule of CommandMemberRules) picked = setCommandMembers(picked, rule, members[rule]);
		const restrictions = setCommandRestriction(readCommandRestrictions(settings.commandsRestrictions), picked);
		// The restrictions are plain objects, which is what the JSON column holds:
		await trx
			.write({
				commandsDisabled: disable ? [...others, command] : others,
				commandsRestrictions: restrictions as never
			})
			.submitWithAudit(actorId);
		return true;
	}

	private async legacy(interaction: ComponentInteraction, t: ReturnType<typeof createTranslator>) {
		const denial = await this.getDenial(interaction, t);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });
		// The nodes and their file can take a moment, which the three seconds of the first answer may not have:
		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
		const settings = await readSettings(interaction.guildId!);
		return deferred.update({
			content: t('commands/commands:legacyExplanation'),
			allowed_mentions: { parse: [] },
			files: [
				{
					name: 'legacy-permission-nodes.json',
					data: Buffer.from(JSON.stringify(getLegacyPermissions(settings), null, 2)),
					contentType: 'application/json'
				}
			],
			components: [renderLegacyPermissionButtons({ t, ownerId: interaction.user.id }, getLegacyPermissionRevision(settings))]
		});
	}

	private async getLegacyOwnerDenial(interaction: InteractionHandler.Interaction, t: ReturnType<typeof createTranslator>) {
		const denial = await this.getDenial(interaction, t);
		if (denial !== null) return denial;
		const guild = await this.container.gatewayClient.guilds.fetch(interaction.guildId!);
		return guild.ownerId === interaction.user.id ? null : t('commands/commands:legacyOwnerOnly');
	}

	private async clearLegacy(interaction: ModalInteraction, revision: number, t: ReturnType<typeof createTranslator>) {
		const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
		const denial = await this.getLegacyOwnerDenial(interaction, t);
		if (denial !== null) return reply(denial);
		if (getModalValue(interaction.data.components, 'confirmation') !== 'REMOVE') return reply(t('commands/commands:legacyConfirmationInvalid'));
		using trx = await writeSettingsTransaction(interaction.guildId!);
		if (getLegacyPermissionRevision(trx.settings) !== revision) return reply(t('commands/commands:legacyStale'));
		// The dashboard access rules share the columns and are not legacy nodes: they stay.
		await trx
			.write({
				permissionsUsers: keepDashboardAccessEntries(trx.settings.permissionsUsers),
				permissionsRoles: keepDashboardAccessEntries(trx.settings.permissionsRoles)
			})
			.submitWithAudit(interaction.user.id);
		return reply(t('commands/commands:legacyRemoved'));
	}

	/**
	 * Reads whether the author of an interaction is not allowed to edit the commands of the server.
	 *
	 * @returns The reason, `null` when they may manage the settings of the server, see `canManageServerSettings`.
	 */
	private async getDenial(interaction: InteractionHandler.Interaction, t: ReturnType<typeof createTranslator>) {
		const { guildId, member } = interaction;
		if (guildId === undefined || member === undefined) return getDefaultExpiredReply();
		if (await canManageServerSettingsFrom({ guildId, member })) return null;

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
