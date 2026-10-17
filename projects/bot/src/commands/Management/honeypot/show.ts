import { readSettings } from '#lib/database';
import { HoneypotRoot, renderHoneypotSummary } from '#lib/moderation/honeypot/commands';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/honeypot show`, see the `honeypot` parent command. Shows the channel of the honeypot and each of its settings.
 */
@RegisterAsSubcommand('honeypot', (builder) => applyLocalizedBuilder(builder, `${HoneypotRoot}:show`))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const settings = await readSettings(interaction.guildId);
		return interaction.reply({
			embeds: [renderHoneypotSummary(t, settings).toJSON()],
			flags: MessageFlags.Ephemeral,
			allowed_mentions: { parse: [] }
		});
	}
}
