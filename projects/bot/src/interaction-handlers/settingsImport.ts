import { renderStatus, renderStatusUpdate } from '#utils/status';
import { applyConfigurationImport, ConfigurationImportStaleError } from '#lib/database/settings/transfer/apply';
import { decodeSettingsImportId, takePendingImport } from '#lib/database/settings/transfer/pending';
import { countPlannedRules } from '#lib/database/settings/transfer/plan';
import { canManageServerSettingsFrom } from '#lib/structures/commands/permissions';
import { createTranslator } from '#lib/structures/commands/utils';
import { ApplyOptions } from '@wolfstar/decorators';
import { InteractionHandler, ModalSubmitInteraction } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';

type ComponentInteraction = Exclude<InteractionHandler.Interaction, InteractionHandler.ModalInteraction>;

/**
 * Handles the buttons under the preview of an import of the settings menu, see `lib/database/settings/transfer/pending.ts`.
 *
 * @remarks
 *
 * The menu keeps nothing in memory: what the file holds waits in Redis and the button says which import it answers,
 * so any process can handle the click, the shard that showed the preview or another one. The import is taken before it
 * is written, which only one click can do. What is written is worked out again from what the database has by then, see
 * `applyConfigurationImport`. Only the administrator who imports the file can answer: the `administrator` precondition
 * checks the level again at the click, and `canManageServerSettings` that no dashboard access rule keeps them out.
 */
@ApplyOptions<InteractionHandler.Options>({ preconditions: ['administrator'] })
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const { guildId } = interaction;
		const action = decodeSettingsImportId(content);
		const fail = (message: string) => interaction.reply(renderStatus('error', message));
		if (action === null || guildId === undefined || interaction instanceof ModalSubmitInteraction) return fail(getDefaultExpiredReply());

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		if (interaction.user.id !== action.ownerId) return fail(t('commands/conf:menuWrongUser'));
		// The access check may read the roles from Discord, and the locks and the transaction may take longer than the
		// three seconds an interaction waits for an answer: the click is answered first, so the import is never taken
		// by a click Discord already gave up on.
		const component = interaction as ComponentInteraction;
		const deferred = await component.deferUpdate();
		if (interaction.member === undefined || !(await canManageServerSettingsFrom({ guildId, member: interaction.member }))) {
			return component.followup(renderStatus('error', t('preconditions:administrator', { command: { name: this.name } })));
		}

		const close = (message: string, kind: 'info' | 'success' | 'error' = 'error') => renderStatusUpdate(kind, message);

		// Taking the import is what answers it, so a second click finds nothing, on this process or on another:
		const parsed = await takePendingImport(guildId, action.ownerId, action.importId);
		if (action.verb === 'cancel') return deferred.update(close(t('commands/conf:transferImportCancelled'), 'info'));
		if (parsed === null) return deferred.update(close(t('commands/conf:transferImportExpired')));

		try {
			// The plan is worked out again under the locks, from what the database has now:
			const done = await applyConfigurationImport(guildId, parsed, interaction.user.id);
			const message = done.isEmpty
				? t('commands/conf:transferNothing')
				: t('commands/conf:transferImportDone', { settings: done.settings.length, ...countPlannedRules(done) });

			return await deferred.update(close(message, done.isEmpty ? 'info' : 'success'));
		} catch (error) {
			if (error instanceof ConfigurationImportStaleError) return deferred.update(close(t('commands/conf:transferImportStale')));

			this.container.logger.error('[Settings] Could not write an import:', error);
			return deferred.update(close(t('events/errors:unexpectedError')));
		}
	}
}
