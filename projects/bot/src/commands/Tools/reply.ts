import { MaximumAppealMessageLength } from '#lib/moderation/appeals';
import { fetchGuildT } from '#lib/moderation/common/util';
import { createTranslator } from '#lib/structures/commands/utils';
import { userMention } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import { container, Command, RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags } from 'discord-api-types/v10';
import { fetchPendingAppeals, type Appeal } from 'wolfstar-database';

/**
 * The value of an appeal in the option of this command: its guild and its case, since a member may appeal in several.
 */
function getReplyValue(appeal: Appeal) {
	return `${appeal.guildId}:${appeal.caseId}`;
}

/**
 * `/reply`, with which a member answers the staff from their direct messages with the bot: what they write goes to the
 * thread of their appeal. It is installed on their account, which the appeal page asks them to do: it is also what lets
 * the bot write to who shares no server with it.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/reply:name', 'commands/reply:description')
		.setContexts(InteractionContextType.BotDM)
		.setIntegrationTypes(ApplicationIntegrationType.UserInstall)
		.addStringOption((option) =>
			applyLocalizedBuilder(option, 'commands/reply:optionsMessage').setRequired(true).setMaxLength(MaximumAppealMessageLength)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/reply:optionsAppeal').setAutocomplete(true))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: Command.ChatInputInteraction, options: Command.OptionsOf<'reply'>) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const fail = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

		const pending = await fetchPendingAppeals(container.prisma, interaction.user.id);
		if (pending.length === 0) return fail(t('commands/reply:none'));

		const appeals = pending.filter((appeal) => appeal.threadId !== null);
		if (appeals.length === 0) return fail(t('commands/reply:noThread'));
		if (options.appeal === undefined && appeals.length > 1) return fail(t('commands/reply:choose'));

		const appeal = options.appeal === undefined ? appeals[0] : appeals.find((item) => getReplyValue(item) === options.appeal);
		if (appeal === undefined) return fail(t('commands/reply:notFound'));

		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
		try {
			const guild = await container.gatewayClient.guilds.fetch(appeal.guildId);
			const guildT = await fetchGuildT(guild);
			const content = guildT('commands/reply:posted', {
				user: userMention(appeal.userId),
				message: cutText(options.message, MaximumAppealMessageLength)
			});
			await container.gatewayClient.api.channels.createMessage(appeal.threadId!, { content, allowed_mentions: { parse: [] } });
			return await deferred.update({ content: t('commands/reply:sent') });
		} catch (error) {
			// The server may be gone, or the staff deleted the thread:
			container.logger.debug(`[Appeals] A reply of ${appeal.userId} to the appeal ${appeal.id} did not arrive:`, error);
			return deferred.update({ content: t('commands/reply:failed') });
		}
	}

	public override async autocompleteRun(
		interaction: Command.AutocompleteInteraction,
		args: Command.AutocompleteArguments<Pick<Command.OptionsOf<'reply'>, 'appeal'>>
	) {
		if (args.focused !== 'appeal') return interaction.replyEmpty();

		const appeals = await fetchPendingAppeals(container.prisma, interaction.user.id);
		const choices = await Promise.all(
			appeals
				.filter((appeal) => appeal.threadId !== null)
				.slice(0, 25)
				.map(async (appeal) => {
					const guild = await container.gatewayClient.guilds.fetch(appeal.guildId).catch(() => null);
					return { name: cutText(`${guild?.name ?? appeal.guildId} · #${appeal.caseId}`, 100), value: getReplyValue(appeal) };
				})
		);
		return interaction.reply({ choices });
	}
}
