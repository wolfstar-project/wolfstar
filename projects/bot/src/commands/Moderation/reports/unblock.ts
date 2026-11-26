import { renderStatus } from '#utils/status';
import { writeSettingsTransaction } from '#lib/database';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { userMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

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
	public override async chatInputRun(interaction: GuildChatInputInteraction, args: Command.OptionsOf<'reports unblock'>) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const user = userMention(args.user.id);
		const reply = (content: string, kind: 'info' | 'success' = 'info') => interaction.reply(renderStatus(kind, content));

		using trx = await writeSettingsTransaction(interaction.guildId);
		const blocked = trx.settings.reportsBlockedUsers;
		if (!blocked.includes(args.user.id)) return reply(t('commands/report:commandUnblockMissing', { user }));

		await trx.write({ reportsBlockedUsers: blocked.filter((id) => id !== args.user.id) }).submitWithAudit(interaction.user.id);
		return reply(t('commands/report:commandUnblockDone', { user }), 'success');
	}
}
