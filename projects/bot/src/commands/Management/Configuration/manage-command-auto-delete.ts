import { readSettings, writeSettings, writeSettingsTransaction } from '#lib/database';
import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { minutes, seconds } from '#utils/common';
import { resolveTimeSpan } from '#utils/resolvers';
import { channelMention, codeBlock } from '@discordjs/formatters';
import { Command, RegisterCommand, RegisterSubcommand, type TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * An entry of the `commandsAutoDelete` setting: the channel, and the milliseconds to wait before deleting the replies.
 */
type CommandAutoDelete = readonly [channelId: string, time: number];

const MinimumDuration = seconds(1);
const MaximumDuration = minutes(2);

const Root = 'commands/management:managecommandautodelete';

@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, Root)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
)
export class UserCommand extends Command {
	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, `${Root}SubcommandAdd`)
			.addStringOption((option) => applyLocalizedBuilder(option, `${Root}OptionsDuration`).setRequired(true))
			.addChannelOption((option) =>
				applyLocalizedBuilder(option, 'commands/shared:optionsChannel')
					.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
					.setRequired(false)
			)
	)
	public async add(interaction: GuildChatInputInteraction, options: UserCommand.AddArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);

		const result = resolveTimeSpan(options.duration, { minimum: MinimumDuration, maximum: MaximumDuration });
		if (result.isErr()) {
			const content = translateKey(t, result.unwrapErr(), { parameter: options.duration, minimum: MinimumDuration, maximum: MaximumDuration });
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		const time = result.unwrap();
		const channelId = options.channel?.id ?? interaction.channel.id;

		using trx = await writeSettingsTransaction(interaction.guildId);
		const { commandsAutoDelete } = trx.settings;
		const index = commandsAutoDelete.findIndex(([id]: CommandAutoDelete) => id === channelId);
		const value: CommandAutoDelete = [channelId, time];

		const next = index === -1 ? commandsAutoDelete.concat([value]) : commandsAutoDelete.with(index, value);
		await trx.write({ commandsAutoDelete: next }).submitWithAudit(interaction.user.id);

		const content = translateKey(t, 'commands/management:manageCommandAutoDeleteAdd', { channel: channelMention(channelId), time });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, `${Root}SubcommandRemove`).addChannelOption((option) =>
			applyLocalizedBuilder(option, 'commands/shared:optionsChannel')
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
				.setRequired(false)
		)
	)
	public async remove(interaction: GuildChatInputInteraction, options: UserCommand.ChannelArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);
		const channelId = options.channel?.id ?? interaction.channel.id;

		using trx = await writeSettingsTransaction(interaction.guildId);
		const { commandsAutoDelete } = trx.settings;
		const index = commandsAutoDelete.findIndex(([id]: CommandAutoDelete) => id === channelId);
		if (index === -1) {
			const content = translateKey(t, 'commands/management:manageCommandAutoDeleteRemoveNotset', { channel: channelMention(channelId) });
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		await trx.write({ commandsAutoDelete: commandsAutoDelete.toSpliced(index, 1) }).submitWithAudit(interaction.user.id);

		const content = translateKey(t, 'commands/management:manageCommandAutoDeleteRemove', { channel: channelMention(channelId) });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	@RegisterSubcommand((builder) => applyLocalizedBuilder(builder, `${Root}SubcommandReset`))
	public async reset(interaction: GuildChatInputInteraction) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		await writeSettings(interaction.guildId, { commandsAutoDelete: [] }, interaction.user.id);

		const t = getSupportedUserLanguageT(interaction);
		const content = translateKey(t, 'commands/management:manageCommandAutoDeleteReset');
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	@RegisterSubcommand((builder) => applyLocalizedBuilder(builder, `${Root}SubcommandShow`))
	public async show(interaction: GuildChatInputInteraction) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);
		const { commandsAutoDelete } = await readSettings(interaction.guildId);

		const list: string[] = [];
		for (const [channelId, time] of commandsAutoDelete) {
			const channel = await this.container.gatewayClient.channels.cache.get(channelId);
			// The stored value is in milliseconds, unlike what the prefix command displayed:
			if (channel && 'name' in channel)
				list.push(`${String(channel.name).padEnd(26)} :: ${translateKey(t, 'globals:durationValue', { value: time })}`);
		}

		if (list.length === 0) {
			return interaction.reply({
				content: translateKey(t, 'commands/management:manageCommandAutoDeleteShowEmpty'),
				flags: MessageFlags.Ephemeral
			});
		}

		const content = translateKey(t, 'commands/management:manageCommandAutoDeleteShow', { codeblock: codeBlock('asciidoc', list.join('\n')) });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}

export namespace UserCommand {
	export interface ChannelArguments {
		channel?: TransformedArguments.Channel;
	}

	export interface AddArguments extends ChannelArguments {
		duration: string;
	}
}
