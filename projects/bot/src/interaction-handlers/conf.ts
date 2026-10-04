import {
	getConfigurableGroups,
	getConfigurableKeys,
	reset,
	writeSettings,
	type ReadonlyGuildData,
	type SchemaDataKey,
	type Serializer
} from '#lib/database';
import { CommandPermissionLevel, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { createTranslator, type Translator } from '#lib/structures/commands/utils';
import {
	RootModuleValue,
	SettingsModalInputId,
	createSettingsMenuContext,
	decodeSettingsMenuId,
	getSettingKind,
	getSettingTitle,
	getVisibleKeys,
	parseSettingInput,
	validateSettingPick,
	type SettingsMenuContext,
	renderSettingsEditor,
	renderSettingsGroup,
	renderSettingsModal,
	resolveSettingGroup,
	type SettingsMenuAction
} from '#lib/structures/settings-menu';
import { InteractionHandler, ModalSubmitInteraction, container } from '@wolfstar/http-framework';
import { MessagePrompter, getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags, Routes, type Snowflake } from 'discord-api-types/v10';

type ModalInteraction = InteractionHandler.ModalInteraction;
type ComponentInteraction = Exclude<InteractionHandler.Interaction, ModalInteraction>;

/**
 * Handles the components and the modal of the settings menu the `conf` command opens, see `lib/structures/settings-menu`.
 *
 * @remarks
 *
 * What a component does is read from its custom ID, so there is no state to keep between the clicks. Only the user who
 * opened the menu can use it, and they need the administrator level every time, since it may have been taken away from
 * them in the meantime.
 */
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const { guildId } = interaction;
		const action = decodeSettingsMenuId(content);
		if (action === null || guildId === undefined) return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const fail = (message: string) => interaction.reply({ content: message, flags: MessageFlags.Ephemeral });

		if (interaction.user.id !== action.ownerId) return fail(t('commands/conf:menuWrongUser'));
		if (
			interaction.member === undefined ||
			!(await hasCommandPermissionLevel({ guildId, member: interaction.member }, CommandPermissionLevel.Administrator))
		) {
			return fail(t('preconditions:administrator', { command: { name: this.name } }));
		}

		// The modal of a key is the only thing that is submitted, everything else is a click:
		if (interaction instanceof ModalSubmitInteraction) {
			const key = this.getKey(action);
			if (key === null || action.verb !== 'submit') return fail(t('commands/conf:getNoExt', { key: action.target }));
			return this.submit(interaction, guildId, action, key);
		}

		switch (action.verb) {
			case 'view':
			case 'refresh':
				return this.showGroup(interaction, guildId, action, resolveSettingGroup(action.target));
			case 'module':
				return this.showGroup(interaction, guildId, action, resolveSettingGroup(this.getModule(interaction)));
			case 'resetAll':
				return this.resetGroup(interaction, guildId, action, t);
			case 'page':
				return interaction.deferUpdate();
		}

		const key = this.getKey(action);
		if (key === null) return fail(t('commands/conf:getNoExt', { key: action.target }));

		switch (action.verb) {
			case 'toggle':
				return this.write(interaction, guildId, action, key, (settings) => !settings[key.property]);
			case 'reset':
				return this.write(interaction, guildId, action, key, () => key.default);
			case 'edit':
				return this.edit(interaction, guildId, action, key);
			case 'pick':
				return this.pick(interaction, guildId, action, key);
			default:
				return fail(getDefaultExpiredReply());
		}
	}

	/**
	 * The key an action targets, `null` when there is none the menu shows.
	 */
	private getKey(action: SettingsMenuAction): SchemaKey | null {
		const key = getConfigurableKeys().get(action.target as SchemaDataKey);
		return key === undefined || key.dashboardOnly ? null : key;
	}

	private async showGroup(interaction: ComponentInteraction, guildId: Snowflake, action: SettingsMenuAction, group: SchemaGroup | null) {
		const context = await createSettingsMenuContext(interaction, guildId, action.ownerId);
		return interaction.update(renderSettingsGroup(context, group ?? getConfigurableGroups(), action.page));
	}

	/**
	 * Opens the editor of a key: a view with a select menu for the keys that are picked, a modal for the ones that are
	 * written.
	 */
	private async edit(interaction: ComponentInteraction, guildId: Snowflake, action: SettingsMenuAction, key: SchemaKey) {
		const context = await createSettingsMenuContext(interaction, guildId, action.ownerId);
		switch (getSettingKind(key)) {
			case 'role':
			case 'channel':
			case 'language':
				return interaction.update(renderSettingsEditor(context, key, action.page));
			case 'number':
			case 'text':
				return interaction.showModal(renderSettingsModal(context, key, action.page));
			default:
				return interaction.update(renderSettingsGroup(context, key.parent ?? getConfigurableGroups(), action.page));
		}
	}

	private async submit(interaction: ModalInteraction, guildId: Snowflake, action: SettingsMenuAction, key: SchemaKey) {
		const context = await createSettingsMenuContext(interaction, guildId, action.ownerId);
		const input = getModalValue(interaction.data.components, SettingsModalInputId) ?? '';
		const parsed = await parseSettingInput(this.getSerializerContext(context, key), input);
		if (!parsed.ok) return interaction.reply({ content: parsed.error, flags: MessageFlags.Ephemeral });

		await writeSettings(guildId, { [key.property]: parsed.value }, interaction.user.id);
		return interaction.update(
			renderSettingsGroup(await createSettingsMenuContext(interaction, guildId, action.ownerId), this.getGroup(key), action.page)
		);
	}

	/**
	 * Stores what was picked in the select menu of the editor of a key, once its serializer accepts every value.
	 */
	private async pick(interaction: ComponentInteraction, guildId: Snowflake, action: SettingsMenuAction, key: SchemaKey) {
		const context = await createSettingsMenuContext(interaction, guildId, action.ownerId);
		const parsed = await validateSettingPick(this.getSerializerContext(context, key), getSelectValues(interaction));
		if (!parsed.ok) return interaction.reply({ content: parsed.error, flags: MessageFlags.Ephemeral });

		return this.write(interaction, guildId, action, key, () => parsed.value);
	}

	private getSerializerContext(context: SettingsMenuContext, key: SchemaKey): Serializer.UpdateContext {
		return { entry: key, entity: context.settings, guild: context.guild, t: context.t };
	}

	private getGroup(key: SchemaKey) {
		return key.parent ?? getConfigurableGroups();
	}

	/**
	 * Writes a key, then shows the page of its group it was on.
	 */
	private async write(
		interaction: ComponentInteraction,
		guildId: Snowflake,
		action: SettingsMenuAction,
		key: SchemaKey,
		getValue: (settings: ReadonlyGuildData) => unknown
	) {
		await writeSettings(guildId, (settings) => ({ [key.property]: getValue(settings) }), interaction.user.id);

		const context = await createSettingsMenuContext(interaction, guildId, action.ownerId);
		return interaction.update(renderSettingsGroup(context, key.parent ?? getConfigurableGroups(), action.page));
	}

	/**
	 * Resets every key of a group, and of its groups, after the user confirmed in an ephemeral prompt.
	 */
	private async resetGroup(interaction: ComponentInteraction, guildId: Snowflake, action: SettingsMenuAction, t: Translator) {
		const group = resolveSettingGroup(action.target) ?? getConfigurableGroups();
		// The page of the root only holds its own keys, the modules are reset one by one:
		const keys = getVisibleKeys(group, group.parent !== null);
		const module = group.parent === null ? t('commands/conf:menuModuleGeneral') : getSettingTitle(group);

		const prompter = new MessagePrompter(t('commands/conf:menuResetConfirm', { count: keys.length, module }), 'confirm', {
			confirmLabel: t('commands/conf:menuResetButton'),
			cancelLabel: t('commands/conf:menuCancel')
		});

		// The prompt is the reply to the click, and it is only for the user who clicked:
		const confirmed = await prompter.run({
			user: interaction.user,
			applicationId: interaction.applicationId,
			token: interaction.token,
			channel: interaction.channel,
			reply: (data) => interaction.reply({ ...data, flags: MessageFlags.Ephemeral })
		});
		if (confirmed === null) return null;
		if (!confirmed) return interaction.followup({ content: t('commands/conf:menuResetCancelled'), flags: MessageFlags.Ephemeral });

		await writeSettings(guildId, Object.assign({}, ...keys.map((key) => reset(key))), interaction.user.id);

		// The click was answered with the prompt, so the menu is edited as the message of the bot it is:
		const context = await createSettingsMenuContext(interaction, guildId, action.ownerId);
		const { message } = interaction;
		await container.rest
			.patch(Routes.channelMessage(message.channel_id, message.id), { body: renderSettingsGroup(context, group, action.page) })
			.catch((error: unknown) => container.logger.warn('[Settings] Could not refresh the menu after a reset:', error));

		return interaction.followup({ content: t('commands/conf:menuResetDone', { module }), flags: MessageFlags.Ephemeral });
	}

	/**
	 * The path of the group picked in the module select menu.
	 */
	private getModule(interaction: ComponentInteraction) {
		const [value] = getSelectValues(interaction);
		return value === undefined || value === RootModuleValue ? '' : value;
	}
}

function getSelectValues(interaction: ComponentInteraction): string[] {
	const { data } = interaction;
	return 'values' in data ? [...data.values] : [];
}

/**
 * Finds the value of a text input of a submitted modal, which Discord nests in rows or labels.
 */
function getModalValue(components: readonly unknown[], customId: string): string | null {
	for (const component of components) {
		if (typeof component !== 'object' || component === null) continue;

		const entry = component as { custom_id?: string; value?: string; components?: readonly unknown[]; component?: unknown };
		if (entry.custom_id === customId && typeof entry.value === 'string') return entry.value;

		const nested = getModalValue([...(entry.components ?? []), ...(entry.component === undefined ? [] : [entry.component])], customId);
		if (nested !== null) return nested;
	}

	return null;
}
