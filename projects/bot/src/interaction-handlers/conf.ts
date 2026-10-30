import type { SchemaGroup } from '#lib/database/settings/schema/SchemaGroup';
import type { SchemaKey } from '#lib/database/settings/schema/SchemaKey';
import { getConfigurableGroups, getConfigurableKeys, reset, writeSettings, type SchemaDataKey, type Serializer } from '#lib/database';
import { type ReadonlyGuildData } from 'wolfstar-database';
import { fetchUserReportEnabled, toggleUserReportEnabled } from '#lib/database';
import { canManageServerSettingsFrom } from '#lib/structures/commands/permissions';
import { isHoneypotSettingsWrite, writeHoneypotSettings } from '#lib/moderation/honeypot/settings';
import { createTranslator, type Translator } from '#lib/structures/commands/utils';
import { downloadConfigurationFile } from '#lib/database/settings/transfer/attachment';
import { MaximumConfigurationFileSize } from '#lib/database/settings/transfer/format';
import { createConfigurationExportMessage, createConfigurationImportMessage } from '#lib/database/settings/transfer/messages';
import {
	RootModuleValue,
	SettingsModalInputId,
	getTimeZoneInputId,
	createSettingsMenuContext,
	decodeSettingsMenuId,
	getSettingKind,
	getSettingTitle,
	getVisibleKeys,
	isSettingsMenuExpired,
	parseSettingInput,
	validateSettingPick,
	type SettingsMenuContext,
	renderSettingsEditor,
	renderSettingsGroup,
	renderSettingsModal,
	renderSettingsImportModal,
	readSettingsImportSubmission,
	claimSettingsExpiredNotice,
	renderSettingsExpired,
	renderUserSettings,
	resolveSettingGroup,
	type SettingsMenuAction
} from '#lib/structures/settings-menu';
import { getModalValue, getModalValues } from 'wolfstar-shared';
import { TimeZoneGroups, type TimeZoneGroup } from 'wolfstar-shared';
import { InteractionHandler, ModalSubmitInteraction, container } from '@wolfstar/http-framework';
import { MessagePrompter, getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags, Routes, type Snowflake } from 'discord-api-types/v10';

type ModalInteraction = InteractionHandler.ModalInteraction;
type ComponentInteraction = Exclude<InteractionHandler.Interaction, ModalInteraction>;

/**
 * Handles the components and the modal of the settings menus `/settings server` and `/settings user` open, see
 * `lib/structures/settings-menu`.
 *
 * @remarks
 *
 * What a component does is read from its custom ID, so there is no state to keep between the clicks. Only the user who
 * opened the menu can use it, and they need the administrator level every time, since it may have been taken away from
 * them in the meantime. The menu of the user only needs to be theirs. A menu stops working fifteen minutes after it
 * was last used: the time is in the custom IDs, which every click renders again, see `SettingsMenuLifetime`. A click
 * on it is then told so in an ephemeral message, five times at most.
 *
 * The page of the general module exports the configuration of the server and imports one, see
 * `lib/database/settings/transfer`: the export is an ephemeral file, the import a modal that takes the file or what it
 * holds, answered with the preview the `settingsImport` interaction handler confirms.
 */
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const { guildId } = interaction;
		const action = decodeSettingsMenuId(content);
		if (action === null) return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const fail = (message: string) => interaction.reply({ content: message, flags: MessageFlags.Ephemeral });

		if (interaction.user.id !== action.ownerId) return fail(t('commands/conf:menuWrongUser'));

		// A menu that was left alone too long is closed. It is left as it is, and the click is told so:
		if (isSettingsMenuExpired(action)) {
			if (interaction instanceof ModalSubmitInteraction) return fail(t('commands/conf:menuExpiredModal'));

			// Who keeps clicking is not told again, the click is only acknowledged:
			const component = interaction as ComponentInteraction;
			const answered = await claimSettingsExpiredNotice(component.message.id, interaction.user.id);
			return answered ? fail(renderSettingsExpired(t, action.verb === 'userToggle' ? 'user' : 'server')) : component.deferUpdate();
		}
		if (action.verb === 'userToggle' && !(interaction instanceof ModalSubmitInteraction)) return this.toggleUser(interaction, action, t);

		if (guildId === undefined) return fail(getDefaultExpiredReply());
		if (interaction.member === undefined || !(await canManageServerSettingsFrom({ guildId, member: interaction.member }))) {
			return fail(t('preconditions:administrator', { command: { name: this.name } }));
		}

		// The modal of a key and the one of the import are the only things that are submitted, everything else is a click:
		if (interaction instanceof ModalSubmitInteraction) {
			if (action.verb === 'importSubmit') return this.importFile(interaction, guildId, t);

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
			case 'export':
				return this.exportFile(interaction, guildId, t);
			case 'import':
				return interaction.showModal(renderSettingsImportModal({ t, ownerId: action.ownerId }, action.page));
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
	 * Flips a setting of the user, then shows their settings again.
	 */
	private async toggleUser(interaction: ComponentInteraction, action: SettingsMenuAction, t: Translator) {
		if (action.target !== 'report') return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });

		await toggleUserReportEnabled(interaction.user.id);
		const report = await fetchUserReportEnabled(interaction.user.id);
		return interaction.update(renderUserSettings({ t, ownerId: action.ownerId, report }));
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
			case 'choice':
				return interaction.update(renderSettingsEditor(context, key, action.page));
			case 'number':
			case 'text':
			case 'timezone':
				return interaction.showModal(renderSettingsModal(context, key, action.page));
			default:
				return interaction.update(renderSettingsGroup(context, key.parent ?? getConfigurableGroups(), action.page));
		}
	}

	private async submit(interaction: ModalInteraction, guildId: Snowflake, action: SettingsMenuAction, key: SchemaKey) {
		const context = await createSettingsMenuContext(interaction, guildId, action.ownerId);
		let input: string;
		if (getSettingKind(key) === 'timezone') {
			// A select menu for each group of zones, of which the user picks one:
			const picked = (Object.keys(TimeZoneGroups) as TimeZoneGroup[]).flatMap((group) =>
				getModalValues(interaction.data.components, getTimeZoneInputId(group))
			);
			// Nothing was chosen, the zone stays as it is:
			if (picked.length === 0) return interaction.update(renderSettingsGroup(context, this.getGroup(key), action.page));
			if (picked.length > 1)
				return interaction.reply({ content: context.t('commands/conf:menuTimezoneMultiple'), flags: MessageFlags.Ephemeral });
			input = picked[0];
		} else {
			input = getModalValue(interaction.data.components, SettingsModalInputId) ?? '';
		}

		const parsed = await parseSettingInput(this.getSerializerContext(context, key), input);
		if (!parsed.ok) return interaction.reply({ content: parsed.error, flags: MessageFlags.Ephemeral });

		return this.commit(interaction, guildId, action, key, () => ({ [key.property]: parsed.value }), context.t);
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
		return this.commit(
			interaction,
			guildId,
			action,
			key,
			(settings) => ({ [key.property]: getValue(settings) }),
			createTranslator(getSupportedUserLanguageT(interaction))
		);
	}

	/**
	 * Writes a key, then shows the page of its group it was on. The keys of the honeypot go through
	 * `writeHoneypotSettings`, which checks them and keeps the warning of its channel as the `/honeypot` commands do.
	 */
	private async commit(
		interaction: InteractionHandler.Interaction,
		guildId: Snowflake,
		action: SettingsMenuAction,
		key: SchemaKey,
		getData: (settings: ReadonlyGuildData) => Partial<ReadonlyGuildData>,
		t: Translator
	) {
		const group = this.getGroup(key);
		if (!isHoneypotSettingsWrite([key.property])) {
			await writeSettings(guildId, getData, interaction.user.id);
			return interaction.update(renderSettingsGroup(await createSettingsMenuContext(interaction, guildId, action.ownerId), group, action.page));
		}

		// The permissions are read and the warning is sent, which may take longer than Discord waits for an answer:
		const deferred = await interaction.deferUpdate();
		const written = await writeHoneypotSettings(guildId, getData as never, interaction.user.id, t);
		if (!written.ok) return interaction.followup({ content: written.error, flags: MessageFlags.Ephemeral });

		await deferred.update(renderSettingsGroup(await createSettingsMenuContext(interaction, guildId, action.ownerId), group, action.page));
		if (written.notes.length === 0) return null;
		return interaction.followup({ content: written.notes.join('\n'), flags: MessageFlags.Ephemeral });
	}

	/**
	 * Answers with the file of the configuration of the server, which is only for the administrator who asked.
	 */
	private async exportFile(interaction: ComponentInteraction, guildId: Snowflake, t: Translator) {
		// A file cannot be sent with the first response of an interaction, so it is acknowledged first:
		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
		const message = await createConfigurationExportMessage(guildId, t);
		return deferred.update(message);
	}

	/**
	 * Reads the file of the modal of the import, or what was pasted in it when no file was attached, and answers with
	 * the preview of what it changes, which the `settingsImport` interaction handler confirms.
	 */
	private async importFile(interaction: ModalInteraction, guildId: Snowflake, t: Translator) {
		const submission = readSettingsImportSubmission(interaction.data);

		const fail = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
		if (submission === null) return fail(t('commands/conf:menuImportMissing'));
		if (submission.type === 'file' && submission.attachment.size > MaximumConfigurationFileSize) {
			return fail(t('commands/conf:transferErrorTooLarge', { maximum: `${MaximumConfigurationFileSize / 1024} KiB` }));
		}

		// Reading the file and the guild may take longer than the three seconds an interaction waits for an answer:
		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });

		const text = submission.type === 'text' ? submission.text : await downloadConfigurationFile(submission.attachment);
		if (text === null) return deferred.update({ content: t('commands/conf:transferErrorDownload') });

		const message = await createConfigurationImportMessage({ guildId, ownerId: interaction.user.id, importId: interaction.id, text, t });
		return deferred.update(message);
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

		// A reset of the honeypot takes the warning off its channel, as `/honeypot disable` does:
		const data = Object.assign({}, ...keys.map((key) => reset(key))) as Partial<ReadonlyGuildData>;
		let notes: string[] = [];
		if (isHoneypotSettingsWrite(Object.keys(data))) {
			const written = await writeHoneypotSettings(guildId, data as never, interaction.user.id, t);
			if (!written.ok) return interaction.followup({ content: written.error, flags: MessageFlags.Ephemeral });
			notes = written.notes;
		} else {
			await writeSettings(guildId, data, interaction.user.id);
		}

		// The click was answered with the prompt, so the menu is edited as the message of the bot it is:
		const context = await createSettingsMenuContext(interaction, guildId, action.ownerId);
		const { message } = interaction;
		await container.rest
			.patch(Routes.channelMessage(message.channel_id, message.id), { body: renderSettingsGroup(context, group, action.page) })
			.catch((error: unknown) => container.logger.warn('[Settings] Could not refresh the menu after a reset:', error));

		const content = [t('commands/conf:menuResetDone', { module }), ...notes].join('\n');
		return interaction.followup({ content, flags: MessageFlags.Ephemeral });
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
