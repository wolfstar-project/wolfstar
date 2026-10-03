import { CommandPermissionLevel, RequiresCommandPermissionLevel, type GuildChatInputInteraction } from '#lib/structures/commands';
import { getDisplayT, handleCase, listDetails, listOverview, sortEntries } from '#lib/structures/commands/moderationCase';
import { getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { isNullish, isNullishOrZero } from '@sapphire/utilities';
import type { TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, createLocalizedChoice } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/case list`, see the `case` parent command.
 */
@RegisterAsSubcommand('case', (builder) =>
	applyLocalizedBuilder(builder, 'commands/case:list')
		.addUserOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsUser'))
		.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsOverview'))
		.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsShow'))
		.addIntegerOption((option) =>
			applyLocalizedBuilder(option, 'commands/case:optionsType').addChoices(
				createLocalizedChoice('moderation:typeRoleAdd', { value: TypeVariation.RoleAdd }),
				createLocalizedChoice('moderation:typeBan', { value: TypeVariation.Ban }),
				createLocalizedChoice('moderation:typeKick', { value: TypeVariation.Kick }),
				createLocalizedChoice('moderation:typeMute', { value: TypeVariation.Mute }),
				createLocalizedChoice('moderation:typeRoleRemove', { value: TypeVariation.RoleRemove }),
				createLocalizedChoice('moderation:typeRestrictedAttachment', { value: TypeVariation.RestrictedAttachment }),
				createLocalizedChoice('moderation:typeRestrictedEmbed', { value: TypeVariation.RestrictedEmbed }),
				createLocalizedChoice('moderation:typeRestrictedEmoji', { value: TypeVariation.RestrictedEmoji }),
				createLocalizedChoice('moderation:typeRestrictedReaction', { value: TypeVariation.RestrictedReaction }),
				createLocalizedChoice('moderation:typeRestrictedVoice', { value: TypeVariation.RestrictedVoice }),
				createLocalizedChoice('moderation:typeSetNickname', { value: TypeVariation.SetNickname }),
				createLocalizedChoice('moderation:typeSoftban', { value: TypeVariation.Softban }),
				createLocalizedChoice('moderation:typeTimeout', { value: TypeVariation.Timeout }),
				createLocalizedChoice('moderation:typeVoiceKick', { value: TypeVariation.VoiceKick }),
				createLocalizedChoice('moderation:typeVoiceMute', { value: TypeVariation.VoiceMute }),
				createLocalizedChoice('moderation:typeWarning', { value: TypeVariation.Warning })
			)
		)
		.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsPendingOnly'))
		.addIntegerOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsPage').setMinValue(1))
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Moderator)
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Options) {
		return handleCase(interaction, async (t) => {
			const show = options.show ?? false;
			const user = options.user?.user ?? null;

			const moderation = await getModeration(interaction.guildId);
			let entries = [...(await moderation.fetch({ userId: user?.id })).values()];
			if (!isNullish(options.type)) entries = entries.filter((entry) => entry.type === options.type);
			if (options['pending-only'] ?? false) entries = entries.filter((entry) => !isNullishOrZero(entry.duration) && !entry.isCompleted());

			const displayT = getDisplayT(interaction, show);
			if (options.overview) {
				const deferred = await interaction.defer(show ? undefined : { flags: MessageFlags.Ephemeral });
				return deferred.update({ embeds: [listOverview(displayT, entries, user).toJSON()] });
			}

			if (entries.length === 0) throw t('commands/case:listEmpty');

			const deferred = await interaction.defer(show ? undefined : { flags: MessageFlags.Ephemeral });
			const embed = await listDetails(interaction, displayT, sortEntries(entries), user === null, options.page ?? 1);
			return deferred.update({ embeds: [embed.toJSON()] });
		});
	}
}

interface Options {
	user?: TransformedArguments.User;
	overview?: boolean;
	show?: boolean;
	type?: TypeVariation;
	'pending-only'?: boolean;
	page?: number;
}
