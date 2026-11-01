import { readAppealOption } from '#lib/moderation/appealCommands';
import { MaximumAppealMessageLength } from '#lib/moderation/appeals';
import { sendAppealDirectMessage } from '#lib/moderation/appealService';
import { fetchGuildT } from '#lib/moderation/common/util';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { userMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { fetchAppealByThread } from 'wolfstar-database';

/**
 * `/appeal send`, see the `appeal` parent command. It sends a direct message to the member who made an appeal, the one of
 * the thread it runs in or, with no thread, the one of its `appeal` option. In a thread the answer stays there for the
 * other moderators, in the language of the guild as the appeal is, whether it reached the member or not; out of one it
 * is the moderator's alone. The member is not told who wrote.
 */
@RegisterAsSubcommand('appeal', (builder) =>
	applyLocalizedBuilder(builder, 'commands/appeal:send')
		.addStringOption((option) =>
			applyLocalizedBuilder(option, 'commands/appeal:optionsMessage').setRequired(true).setMaxLength(MaximumAppealMessageLength)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/appeal:optionsSendAppeal').setAutocomplete(true))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'appeal send'>) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const threaded = await fetchAppealByThread(this.container.prisma, interaction.guildId, interaction.channelId);
		if (threaded === null && options.appeal === undefined) {
			return interaction.reply({ content: t('commands/appeal:sendNotThread'), flags: MessageFlags.Ephemeral });
		}

		const appeal = threaded ?? (await readAppealOption(interaction.guildId, options.appeal!));
		if (appeal === null) return interaction.reply({ content: t('commands/appeal:notFound'), flags: MessageFlags.Ephemeral });

		// Reaching the member takes a few requests, which can be longer than Discord waits for an answer:
		const deferred = await interaction.defer(threaded === null ? { flags: MessageFlags.Ephemeral } : undefined);
		const guild = await this.container.gatewayClient.guilds.fetch(interaction.guildId);
		const sent = await sendAppealDirectMessage(guild, appeal, options.message);

		const guildT = await fetchGuildT(guild);
		const content = sent
			? guildT('commands/appeal:sent', { moderator: userMention(interaction.user.id), message: options.message })
			: guildT('commands/appeal:sendFailed');
		return deferred.update({ content, allowed_mentions: { parse: [] } });
	}
}
