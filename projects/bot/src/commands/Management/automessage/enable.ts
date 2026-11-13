import { GuildTextChannelTypes } from '#utils/channelTypes';
import { readAutoMessage } from '#lib/automessages/store';
import { AutoMessageRoot, renderAutoMessageModal } from '#lib/automessages/render';
import { resolveDurationOption } from '#lib/moderation/automod/commands';
import { createTranslator, translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { AutoMessageIntervalLimits } from 'wolfstar-database';

const Root = AutoMessageRoot;

/**
 * `/automessage enable`, see the `automessage` parent command. Asks for the text of the message in a modal, which the
 * `automessage` interaction handler reads, and replaces the message the channel has. It is sent one interval later.
 */
@RegisterAsSubcommand('automessage', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:automessageEnable`)
		.addChannelOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsChannel`)
				.addChannelTypes(...GuildTextChannelTypes)
				.setRequired(true)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsInterval`).setRequired(true).setMaxLength(32))
		.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsMentions`))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'automessage enable'>) {
		const t = getSupportedUserLanguageT(interaction);
		const interval = resolveDurationOption(t, options.interval, AutoMessageIntervalLimits);
		if (interval === null || typeof interval === 'object') {
			const content = interval === null ? translateKey(t, 'arguments:timeSpan') : interval.error;
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		// The modal opens with the text the channel sends already, so enabling it again edits it:
		const existing = await readAutoMessage(interaction.guildId, options.channel.id);
		const action = { ownerId: interaction.user.id, channelId: options.channel.id, interval, mentions: options.mentions ?? false };
		return interaction.showModal(renderAutoMessageModal(createTranslator(t), action, existing?.content ?? null));
	}
}
