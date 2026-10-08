import { writeSettingsTransaction } from '#lib/database';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { userMention } from '@discordjs/formatters';
import type { CommandOptionsRegistry } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/reports unblock`, see the `reports` parent command. The members who are blocked are the `reports.blocked-users`
 * setting.
 */
@RegisterAsSubcommand('reports', (builder) =>
	applyLocalizedBuilder(builder, 'commands/report:unblock').addUserOption((option) =>
		applyLocalizedBuilder(option, 'commands/report:optionsBlockUser').setRequired(true)
	)
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Moderator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, args: CommandOptionsRegistry['reports unblock']) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const user = userMention(args.user.id);
		const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });

		using trx = await writeSettingsTransaction(interaction.guildId);
		const blocked = trx.settings.reportsBlockedUsers;
		if (!blocked.includes(args.user.id)) return reply(t('commands/report:commandUnblockMissing', { user }));

		await trx.write({ reportsBlockedUsers: blocked.filter((id) => id !== args.user.id) }).submitWithAudit(interaction.user.id);
		return reply(t('commands/report:commandUnblockDone', { user }));
	}
}
