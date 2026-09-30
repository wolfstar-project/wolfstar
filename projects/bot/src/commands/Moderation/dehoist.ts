import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { createTranslator, type GuildChatInputInteraction, type Translator } from '#lib/structures/commands/utils';
import { getColor } from '#utils/util';
import { EmbedBuilder } from '@discordjs/builders';
import { codeBlock } from '@discordjs/formatters';
import { Command, RegisterCommand, container } from '@wolfstar/http-framework';
import type { GuildMember } from '@wolfstar/plugin-gateway';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

const [kLowestNumberCode, kHighestNumberCode] = ['0'.charCodeAt(0), '9'.charCodeAt(0)];
const kLowestCode = 'A'.charCodeAt(0);

interface ErroredChange {
	oldNick: string;
	newNick: string;
}

/**
 * Replaces the first character of the nickname of every member that hoists themselves in the member list.
 *
 * The prefix command edited its reply for the progress, so does this one, through the deferred interaction response.
 * The response is ephemeral to avoid flooding the channel, the progress is reported every 10 members.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/moderation:dehoist')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Moderator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });

		// The gateway cache is not iterable, so every member is requested, which also refreshes the cache:
		const members = await container.gatewayClient.members.request(interaction.guildId);

		const hoistedMembers: GuildMember[] = [];
		for (const member of members) {
			if (this.shouldDeHoist(member) && (await member.fetchManageable())) hoistedMembers.push(member);
		}

		if (hoistedMembers.length > 0) {
			await deferred.update({ content: t('commands/moderation:dehoistStarting', { count: hoistedMembers.length }) }).catch(() => null);
		}

		let counter = 0;
		const errored: ErroredChange[] = [];
		for (let i = 0; i < hoistedMembers.length; i++) {
			const member = hoistedMembers[i];
			const displayName = member.displayName!;

			const char = displayName.codePointAt(0)!;

			// Replace the first character of the offending user's with an UTF-16 character, bringing'em down, down, down.
			// The ternary cuts 2 characters if the 1st codepoint belongs in UTF-16
			const newNick = `🠷${displayName.slice(char <= 0xff ? 1 : 2)}`;
			try {
				await member.setNickname(newNick, 'Dehoisting');
			} catch {
				errored.push({ oldNick: displayName, newNick });
			}

			++counter;

			// update the counter every 10 dehoists
			if ((i + 1) % 10 === 0) {
				const deHoistPercentage = (i / hoistedMembers.length) * 100;
				const content = t('commands/moderation:dehoistProgress', { count: i + 1, percentage: Math.round(deHoistPercentage) });
				await deferred.update({ content }).catch(() => null);
			}
		}

		// We're done!
		const embed = await this.prepareFinalEmbed(interaction, t, members.length, counter, errored);
		return deferred.update({ content: '', embeds: [embed.toJSON()] });
	}

	private shouldDeHoist(member: GuildMember) {
		const { displayName } = member;
		if (!displayName) return false;

		const char = displayName.codePointAt(0)!;

		// If it's lower than '0' or is higher than '9' and lower than 'A', then it's hoisting
		return char < kLowestCode && (char < kLowestNumberCode || char > kHighestNumberCode);
	}

	private async prepareFinalEmbed(
		interaction: GuildChatInputInteraction,
		t: Translator,
		users: number,
		deHoistedMembers: number,
		erroredChanges: ErroredChange[]
	) {
		const options = {
			dehoistedMemberCount: deHoistedMembers,
			dehoistedWithErrorsCount: deHoistedMembers - erroredChanges.length,
			errored: erroredChanges.length,
			users
		};
		const title = t('commands/moderation:dehoistEmbed.title', options);

		const member = await container.gatewayClient.members.fetch(interaction.guildId, interaction.user.id);
		const embed = new EmbedBuilder().setColor(await getColor({ member })).setTitle(title);

		let description = t('commands/moderation:dehoistEmbed.description', options);
		if (deHoistedMembers <= 0) description = t('commands/moderation:dehoistEmbed.descriptionNoone', options);
		if (deHoistedMembers > 1) description = t('commands/moderation:dehoistEmbed.descriptionMultipleMembers', options);
		if (erroredChanges.length > 0) {
			description = t(
				erroredChanges.length > 1
					? 'commands/moderation:dehoistEmbed.descriptionWithMultipleErrors'
					: 'commands/moderation:dehoistEmbed.descriptionWithError',
				options
			);
			const erroredNicknames = erroredChanges.map((entry) => `${entry.oldNick} => ${entry.newNick}`).join('\n');
			embed.addFields({ name: t('commands/moderation:dehoistEmbed.fieldErrorTitle', options), value: codeBlock('js', erroredNicknames) });
		}

		return embed.setDescription(description);
	}
}
