import { readSettings, writeSettingsTransaction } from '#lib/database';
import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import type { SlashCommandChannelOption } from '@discordjs/builders';
import { channelMention } from '@discordjs/formatters';
import { Command, RegisterCommand, RegisterSubcommand, container, type TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

const Root = 'commands/management:manageCommandChannel';

/**
 * The maximum amount of choices Discord accepts in an autocomplete response.
 */
const MaximumChoices = 25;

/**
 * Gets the names of the chat input commands that are registered, which are the ones that can be blocked in a channel.
 */
function getCommandNames(): string[] {
	const names = new Set<string>();
	for (const piece of container.stores.get('commands').values()) {
		const name = piece.router.chatInputName;
		if (name !== null) names.add(name);
	}

	return [...names].sort();
}

function channelOption(option: SlashCommandChannelOption) {
	return applyLocalizedBuilder(option, 'commands/shared:optionsChannel')
		.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
		.setRequired(false);
}

@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, Root)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
)
export class UserCommand extends Command {
	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, `${Root}SubcommandAdd`)
			.addStringOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsCommand').setRequired(true).setAutocomplete(true))
			.addChannelOption(channelOption)
	)
	public async add(interaction: GuildChatInputInteraction, options: UserCommand.CommandArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);

		const command = options.command.toLowerCase();
		if (!getCommandNames().includes(command)) {
			return interaction.reply({
				content: translateKey(t, 'arguments:command', { parameter: options.command }),
				flags: MessageFlags.Ephemeral
			});
		}

		const channelId = options.channel?.id ?? interaction.channel.id;

		using trx = await writeSettingsTransaction(interaction.guildId);

		const { commandsDisabledInChannels } = trx.settings;
		const index = commandsDisabledInChannels.findIndex((entry) => entry.channel === channelId);
		if (index === -1) {
			trx.write({ commandsDisabledInChannels: commandsDisabledInChannels.concat({ channel: channelId, commands: [command] }) });
		} else {
			const entry = commandsDisabledInChannels[index];
			if (entry.commands.includes(command)) {
				const content = translateKey(t, 'commands/management:manageCommandChannelAddAlreadyset');
				return interaction.reply({ content, flags: MessageFlags.Ephemeral });
			}

			trx.write({
				commandsDisabledInChannels: commandsDisabledInChannels.with(index, { channel: channelId, commands: entry.commands.concat(command) })
			});
		}

		await trx.submitWithAudit(interaction.user.id);

		const content = translateKey(t, 'commands/management:manageCommandChannelAdd', { channel: channelMention(channelId), command });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, `${Root}SubcommandRemove`)
			.addStringOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsCommand').setRequired(true).setAutocomplete(true))
			.addChannelOption(channelOption)
	)
	public async remove(interaction: GuildChatInputInteraction, options: UserCommand.CommandArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);

		const command = options.command.toLowerCase();
		const channelId = options.channel?.id ?? interaction.channel.id;

		using trx = await writeSettingsTransaction(interaction.guildId);

		const { commandsDisabledInChannels } = trx.settings;
		const index = commandsDisabledInChannels.findIndex((entry) => entry.channel === channelId);
		const entry = commandsDisabledInChannels[index];
		const commandIndex = entry?.commands.indexOf(command) ?? -1;
		if (commandIndex === -1) {
			const content = translateKey(t, 'commands/management:manageCommandChannelRemoveNotset', { channel: channelMention(channelId) });
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		const next =
			entry.commands.length === 1
				? commandsDisabledInChannels.toSpliced(index, 1)
				: commandsDisabledInChannels.with(index, { channel: channelId, commands: entry.commands.toSpliced(commandIndex, 1) });
		await trx.write({ commandsDisabledInChannels: next }).submitWithAudit(interaction.user.id);

		const content = translateKey(t, 'commands/management:manageCommandChannelRemove', { channel: channelMention(channelId), command });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	@RegisterSubcommand((builder) => applyLocalizedBuilder(builder, `${Root}SubcommandReset`).addChannelOption(channelOption))
	public async reset(interaction: GuildChatInputInteraction, options: UserCommand.ChannelArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);
		const channelId = options.channel?.id ?? interaction.channel.id;

		using trx = await writeSettingsTransaction(interaction.guildId);

		const { commandsDisabledInChannels } = trx.settings;
		const index = commandsDisabledInChannels.findIndex((entry) => entry.channel === channelId);
		if (index === -1) {
			const content = translateKey(t, 'commands/management:manageCommandChannelResetEmpty');
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		await trx.write({ commandsDisabledInChannels: commandsDisabledInChannels.toSpliced(index, 1) }).submitWithAudit(interaction.user.id);

		const content = translateKey(t, 'commands/management:manageCommandChannelReset', { channel: channelMention(channelId) });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	@RegisterSubcommand((builder) => applyLocalizedBuilder(builder, `${Root}SubcommandShow`).addChannelOption(channelOption))
	public async show(interaction: GuildChatInputInteraction, options: UserCommand.ChannelArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);
		const channelId = options.channel?.id ?? interaction.channel.id;

		const { commandsDisabledInChannels } = await readSettings(interaction.guildId);
		const entry = commandsDisabledInChannels.find((entry) => entry.channel === channelId);
		if (!entry?.commands.length) {
			return interaction.reply({
				content: translateKey(t, 'commands/management:manageCommandChannelShowEmpty'),
				flags: MessageFlags.Ephemeral
			});
		}

		const content = translateKey(t, 'commands/management:manageCommandChannelShow', {
			channel: channelMention(channelId),
			commands: `\`${entry.commands.join('` | `')}\``
		});
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	public override autocompleteRun(interaction: Command.AutocompleteInteraction, args: Command.AutocompleteArguments<{ command: string }>) {
		if (args.focused !== 'command') return interaction.replyEmpty();

		const query = (args.command ?? '').toLowerCase();
		const choices = getCommandNames()
			.filter((name) => name.includes(query))
			.slice(0, MaximumChoices)
			.map((name) => ({ name, value: name }));
		return interaction.reply({ choices });
	}
}

export namespace UserCommand {
	export interface ChannelArguments {
		channel?: TransformedArguments.Channel;
	}

	export interface CommandArguments extends ChannelArguments {
		command: string;
	}
}
