import { JoinGuardRoot, renderJoinGuardSummary } from '#lib/moderation/joinguard/commands';
import { readJoinGuardConfig } from '#lib/moderation/joinguard/store';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { days } from 'wolfstar-shared';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { countJoinGuardCheckpoints } from 'wolfstar-database';

/**
 * `/joinguard show`, see the `joinguard` parent command. Shows whether the join guard is on, what it did this week,
 * its rules and the settings of its checkpoint.
 */
@RegisterAsSubcommand('joinguard', (builder) => applyLocalizedBuilder(builder, `${JoinGuardRoot}:show`))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const { guildId } = interaction;
		const [{ settings, rules }, counts] = await Promise.all([
			readJoinGuardConfig(guildId),
			countJoinGuardCheckpoints(this.container.prisma.orm, guildId, Date.now() - days(7))
		]);

		return interaction.reply({
			embeds: [renderJoinGuardSummary(t, guildId, settings, rules, counts).toJSON()],
			flags: MessageFlags.Ephemeral,
			allowed_mentions: { parse: [] }
		});
	}
}
