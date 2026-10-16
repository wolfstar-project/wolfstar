import { readSettings } from '#lib/database';
import { formatGreeting, pickGreeting } from '#lib/greetings/format';
import { sendGreeting } from '#lib/greetings/send';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = 'commands/greetings';

/**
 * `/greetings test`, see the `greetings` parent command. Sends a join or a leave message as if the user who ran it had
 * joined or left, where the server sends it.
 */
@RegisterAsSubcommand('greetings', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:test`).addStringOption((option) =>
		applyLocalizedBuilder(option, `${Root}:optionsType`)
			.setRequired(true)
			.setChoices(createLocalizedChoice(`${Root}:typeJoin`, { value: 'join' }), createLocalizedChoice(`${Root}:typeLeave`, { value: 'leave' }))
	)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'greetings test'>) {
		const t = getSupportedUserLanguageT(interaction);
		const reply = (key: Parameters<typeof translateKey>[1]) =>
			interaction.reply({ content: translateKey(t, key), flags: MessageFlags.Ephemeral });

		const settings = await readSettings(interaction.guildId);
		const join = options.type === 'join';
		const template = pickGreeting(join ? settings.greetingsJoinMessages : settings.greetingsLeaveMessages);
		if (template === null) return reply(`${Root}:testNoMessages`);

		const guild = await this.container.gatewayClient.guilds.fetch(interaction.guildId);
		const content = formatGreeting(template, { user: interaction.user, guild });

		if (join && settings.greetingsJoinDirect) {
			const sent = await interaction.user.send({ content, allowed_mentions: { parse: [] } }).then(
				() => true,
				() => false
			);
			return reply(sent ? `${Root}:testSentDirect` : `${Root}:testFailed`);
		}

		const channelId = join ? settings.greetingsJoinChannel : settings.greetingsLeaveChannel;
		if (channelId === null) return reply(`${Root}:testNoChannel`);

		const sent = await sendGreeting(channelId, content, interaction.user.id);
		return reply(sent ? `${Root}:testSent` : `${Root}:testFailed`);
	}
}
