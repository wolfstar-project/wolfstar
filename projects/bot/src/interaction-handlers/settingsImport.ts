import { applyConfigurationImport, ConfigurationImportStaleError } from '#lib/database/settings/transfer/apply';
import { decodeSettingsImportId, takePendingImport } from '#lib/database/settings/transfer/pending';
import { countPlannedRules } from '#lib/database/settings/transfer/plan';
import { createTranslator } from '#lib/structures/commands/utils';
import { ApplyOptions } from '@wolfstar/decorators';
import { InteractionHandler, ModalSubmitInteraction } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';

type ComponentInteraction = Exclude<InteractionHandler.Interaction, InteractionHandler.ModalInteraction>;

/**
 * Handles the buttons under the preview of an import of the settings menu, see `lib/database/settings/transfer/pending.ts`.
 *
 * @remarks
 *
 * The menu keeps nothing in memory: what the file holds waits in Redis and the button says which import it answers,
 * so any process can handle the click, the shard that showed the preview or another one. The import is taken before it
 * is written, which only one click can do. What is written is worked out again from what the database has by then, see
 * `applyConfigurationImport`. Only the member who imports the file can answer, and the `serverSettings`
 * precondition checks again at the click that they may manage the settings of the server.
 */
@ApplyOptions<InteractionHandler.Options>({ preconditions: ['serverSettings'] })
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const { guildId } = interaction;
		const action = decodeSettingsImportId(content);
		const fail = (message: string) => interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
		if (action === null || guildId === undefined || interaction instanceof ModalSubmitInteraction) return fail(getDefaultExpiredReply());

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		if (interaction.user.id !== action.ownerId) return fail(t('commands/conf:menuWrongUser'));

		const component = interaction as ComponentInteraction;
		const close = (message: string) => ({ content: message, embeds: [], components: [] });

		// Taking the import is what answers it, so a second click finds nothing, on this process or on another:
		const parsed = await takePendingImport(guildId, action.ownerId, action.importId);
		if (action.verb === 'cancel') return component.update(close(t('commands/conf:transferImportCancelled')));
		if (parsed === null) return component.update(close(t('commands/conf:transferImportExpired')));

		// The locks and the transaction may take longer than the three seconds an interaction waits for an answer:
		const deferred = await component.deferUpdate();
		try {
			// The plan is worked out again under the locks, from what the database has now:
			const done = await applyConfigurationImport(guildId, parsed, interaction.user.id);
			const message = done.isEmpty
				? t('commands/conf:transferNothing')
				: t('commands/conf:transferImportDone', { settings: done.settings.length, ...countPlannedRules(done) });

			return await deferred.update(close(message));
		} catch (error) {
			if (error instanceof ConfigurationImportStaleError) return deferred.update(close(t('commands/conf:transferImportStale')));

			this.container.logger.error('[Settings] Could not write an import:', error);
			return deferred.update(close(t('events/errors:unexpectedError')));
		}
	}
}
