import { readSettings } from '#lib/database';
import { AutoModerationRoot } from '#lib/moderation/automod/commands';
import { readAutoModerationRules } from '#lib/moderation/automod/rules';
import { renderAutoModerationRules } from '#lib/structures/automod-menu';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/automod list`, see the `automod` parent command. It opens the auto-moderation menu on the rules of the server.
 */
@RegisterAsSubcommand('automod', (builder) => applyLocalizedBuilder(builder, `${AutoModerationRoot}:list`))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const rules = await readAutoModerationRules(interaction.guildId);
		const settings = await readSettings(interaction.guildId);
		// The menu a rule is picked and configured in, see the `automod` interaction handler:
		const message = renderAutoModerationRules({ t, ownerId: interaction.user.id }, rules, { settings });
		return interaction.reply({ ...message, flags: message.flags! | MessageFlags.Ephemeral });
	}
}
