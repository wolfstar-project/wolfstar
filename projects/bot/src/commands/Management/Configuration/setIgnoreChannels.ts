import { writeSettingsTransaction } from '#lib/database';
import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention } from '@discordjs/builders';
import { Command, RegisterCommand, type TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/management:setIgnoreChannels')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.addChannelOption((option) =>
			applyLocalizedBuilder(option, 'commands/management:setIgnoreChannelsOptionsChannel')
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
				.setRequired(false)
		)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: UserCommand.Arguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);

		// The channel the command was used in is the default of the option:
		const channelId = options.channel?.id ?? interaction.channelId;

		using trx = await writeSettingsTransaction(interaction.guildId);

		const { commandsDisabledChannels } = trx.settings;
		const index = commandsDisabledChannels.indexOf(channelId);
		const disabledChannels = index === -1 ? commandsDisabledChannels.concat(channelId) : commandsDisabledChannels.toSpliced(index, 1);
		await trx.write({ commandsDisabledChannels: disabledChannels }).submitWithAudit(interaction.user.id);

		const key = index === -1 ? 'commands/management:setIgnoreChannelsSet' : 'commands/management:setIgnoreChannelsRemoved';
		return interaction.reply({ content: translateKey(t, key, { channel: channelMention(channelId) }), flags: MessageFlags.Ephemeral });
	}
}

export namespace UserCommand {
	export interface Arguments {
		channel?: TransformedArguments.Channel;
	}
}
