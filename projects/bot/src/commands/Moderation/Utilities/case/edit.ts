import { editCase, MaximumCaseReasonLength, resolveCaseDuration } from '#lib/moderation/caseEdits';
import type { GuildChatInputInteraction } from '#lib/structures/commands';
import { getCase, getDisplayT, handleCase } from '#lib/structures/commands/moderationCase';
import { renderStatus } from '#utils/status';
import { isNullish } from '@sapphire/utilities';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/case edit`, see the `case` parent command.
 *
 * @remarks The edit goes through `editCase`, as the one of the case menu does, so it is in the history of the case. The
 * user of the case is not told: the modal of the menu asks whether to.
 */
@RegisterAsSubcommand('case', (builder) =>
	applyLocalizedBuilder(builder, 'commands/case:edit')
		.addIntegerOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsCase').setMinValue(1).setRequired(true))
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsReason').setMaxLength(MaximumCaseReasonLength))
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsDuration').setMaxLength(50))
)
export class UserCommand extends Command {
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'case edit'>) {
		return handleCase(interaction, async () => {
			const entry = await getCase(interaction, options.case);
			const t = getDisplayT(interaction, false);
			const duration = resolveCaseDuration(t, entry, options.duration);

			// The edit waits for the lock of the case, which may take longer than Discord waits for an answer:
			const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
			const outcome = await editCase({
				entry,
				moderatorId: interaction.user.id,
				t,
				values: {
					...(isNullish(options.reason) ? {} : { reason: options.reason }),
					...(duration === undefined ? {} : { duration })
				},
				notify: false
			});
			if (outcome === null) return deferred.update(renderStatus('error', t('arguments:caseUnknownEntry', { parameter: entry.id })));

			const key = outcome.changes.length === 0 ? 'commands/case:editUnchanged' : 'commands/case:editSuccess';
			return deferred.update(renderStatus(outcome.changes.length === 0 ? 'info' : 'success', t(key, { caseId: entry.id })));
		});
	}
}
