import {
	CommandPermissionLevel,
	createTranslator,
	getCommandPermissionDenial,
	type GuildChatInputInteraction,
	type TranslationKey
} from '#lib/structures/commands';
import { hours, seconds } from '#common';
import { resolveTimeSpan } from '#utils/resolvers';
import { Command, RegisterCommand, container } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT, type AnyNamespace, type TFunction } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

const MaximumDuration = hours(6);

/**
 * The `slowmode` command, which sets the slowmode of the text channel it is run in.
 *
 * @remarks
 *
 * - The required `duration` option accepts a duration, or `reset` and `off` (see `arguments:resetPossibles`) to reset
 *   the slowmode.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/moderation:slowmodeName', 'commands/moderation:slowmodeDescription')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/moderation:slowmodeOptionsDuration').setMaxLength(50).setRequired(true))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, args: { duration: string }) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Moderator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const rawT = getSupportedUserLanguageT(interaction);
		const t = createTranslator(rawT);

		const channel = interaction.channel;
		if (channel.type !== ChannelType.GuildText) {
			return interaction.reply({ content: t('preconditions:guildTextOnly'), flags: MessageFlags.Ephemeral });
		}

		// `app_permissions` are the permissions of the bot in the channel, Discord already applied the overwrites:
		const appPermissions = interaction.applicationPermissions;
		if (appPermissions !== undefined && (appPermissions & PermissionFlagsBits.ManageChannels) === 0n) {
			return interaction.reply({
				content: t('preconditions:clientPermissions', { missing: ['ManageChannels'] }),
				flags: MessageFlags.Ephemeral
			});
		}

		const resetOptions = (rawT as unknown as TFunction<AnyNamespace>)('arguments:resetPossibles', {
			returnObjects: true
		}) as unknown as readonly string[];
		let cooldown: number;
		if (resetOptions.includes(args.duration.toLowerCase())) {
			cooldown = 0;
		} else {
			const result = resolveTimeSpan(args.duration, { minimum: 0, maximum: MaximumDuration });
			if (result.isErr()) {
				const content = t(result.unwrapErr() as TranslationKey, { parameter: args.duration, minimum: 0, maximum: MaximumDuration });
				return interaction.reply({ content, flags: MessageFlags.Ephemeral });
			}

			cooldown = result.unwrap();
		}

		await container.gatewayClient.channels.edit(channel.id, { rateLimitPerUser: seconds.fromMilliseconds(cooldown) });

		const content = cooldown === 0 ? t('commands/moderation:slowmodeReset') : t('commands/moderation:slowmodeSet', { cooldown });
		return interaction.reply({ content });
	}
}
