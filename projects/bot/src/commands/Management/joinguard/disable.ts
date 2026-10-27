import { writeSettings } from '#lib/database';
import { JoinGuardRoot } from '#lib/moderation/joinguard/commands';
import { announceJoinGuardChange, readJoinGuardConfig } from '#lib/moderation/joinguard/store';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = JoinGuardRoot;

/**
 * `/joinguard disable`, see the `joinguard` parent command. Turns the join guard off. Its rules and settings are kept,
 * and the members who wait at the checkpoint can still pass it.
 */
@RegisterAsSubcommand('joinguard', (builder) => applyLocalizedBuilder(builder, `${Root}:disable`))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const { guildId } = interaction;
		const { settings } = await readJoinGuardConfig(guildId);
		if (!settings.joinGuardEnabled) {
			return interaction.reply({ content: translateKey(t, `${Root}:alreadyDisabled`), flags: MessageFlags.Ephemeral });
		}

		await writeSettings(guildId, { joinGuardEnabled: false }, interaction.user.id);
		announceJoinGuardChange(guildId);

		return interaction.reply({ content: translateKey(t, `${Root}:disabled`), flags: MessageFlags.Ephemeral });
	}
}
