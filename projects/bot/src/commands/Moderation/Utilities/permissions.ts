import {
	CommandPermissionLevel,
	createTranslator,
	getCommandPermissionDenial,
	type GuildChatInputInteraction,
	type TranslationKey,
	type Translator
} from '#lib/structures/commands';
import { PermissionsBits, PermissionsBitsList } from '#utils/bits';
import { ModeratorPermissionsBits, ModeratorPermissionsList } from '#utils/constants';
import { getColor, getTag } from '#utils/util';
import { EmbedBuilder, bold } from '@discordjs/builders';
import { Command, RegisterCommand, RegisterUserCommand, container, type InGuild, type TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, applyNameLocalizedBuilder, getSupportedLanguageT, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import {
	ApplicationCommandType,
	ApplicationIntegrationType,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	type APIUser,
	type Permissions
} from 'discord-api-types/v10';

/**
 * The `permissions` command, which lists the permissions of a member, available as a slash command and as the
 * `Inspect Permissions` user context menu command.
 *
 * @remarks The prefix command only answered with a deprecation message, so it is not ported.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/permissions:name', 'commands/permissions:description')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addUserOption((option) => applyLocalizedBuilder(option, 'commands/permissions:optionsUser'))
		.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/permissions:optionsListAll'))
		.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/permissions:optionsListMissing'))
		.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/permissions:optionsShow'))
)
export class UserCommand extends Command {
	public override async chatInputRun(
		interaction: GuildChatInputInteraction,
		args: { user?: TransformedArguments.User; 'list-all'?: boolean; 'list-missing'?: boolean; show?: boolean }
	) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const show = args.show ?? false;
		const target = args.user
			? { user: args.user.user, permissions: args.user.member?.permissions }
			: { user: interaction.user, permissions: interaction.member.permissions };

		return this.#sharedRun(interaction, target.user, target.permissions, args['list-all'] ?? false, args['list-missing'] ?? false, show);
	}

	@RegisterUserCommand((builder) =>
		applyNameLocalizedBuilder(builder, 'commands/permissions:contextMenuName')
			.setType(ApplicationCommandType.User)
			.setContexts(InteractionContextType.Guild)
			.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
	)
	public async contextMenuRun(interaction: InGuild<Command.UserInteraction>, args: TransformedArguments.User) {
		// The check only reads the member, the guild and the name of the command, which every guild interaction has:
		const denial = await getCommandPermissionDenial(interaction as unknown as GuildChatInputInteraction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		return this.#sharedRun(interaction, args.user, args.member?.permissions, false, false, false);
	}

	async #sharedRun(
		interaction: GuildChatInputInteraction | InGuild<Command.UserInteraction>,
		user: APIUser,
		rawPermissions: Permissions | undefined,
		listAll: boolean,
		listMissing: boolean,
		show: boolean
	) {
		const t = createTranslator(show ? getSupportedLanguageT(interaction) : getSupportedUserLanguageT(interaction));
		if (rawPermissions === undefined) return interaction.reply({ content: t('errors:userNotInGuild'), flags: MessageFlags.Ephemeral });

		let content: string;
		const permissions = BigInt(rawPermissions);
		if (PermissionsBits.has(permissions, PermissionFlagsBits.Administrator)) {
			content = t('commands/moderation:permissionsAll');
		} else {
			const list = listAll ? PermissionsBitsList : ModeratorPermissionsList;
			content = listMissing ? this.#renderAllPermissions(t, permissions, list) : this.#renderPermissions(t, permissions, list);
		}

		const member = await container.gatewayClient.members.fetch(interaction.guildId, interaction.user.id).catch(() => null);
		const embed = new EmbedBuilder()
			.setColor(await getColor({ member }))
			.setTitle(t('commands/permissions:title', { username: getTag(user), id: user.id }))
			.setDescription(content);
		return interaction.reply({ embeds: [embed.toJSON()], ...(show ? {} : { flags: MessageFlags.Ephemeral }) });
	}

	#renderPermissions(t: Translator, permissions: bigint, list: readonly (readonly [string, bigint])[]): string {
		const output: string[] = [];
		for (const [name, flag] of list) {
			if (PermissionsBits.has(permissions, flag)) {
				output.push(this.#isModeratorFlag(flag) ? bold(this.#localizePermission(t, name)) : this.#localizePermission(t, name));
			}
		}

		return t('globals:andListValue', { value: output });
	}

	#renderAllPermissions(t: Translator, permissions: bigint, list: readonly (readonly [string, bigint])[]): string {
		const output: string[] = [];
		for (const [name, flag] of list) {
			const isModerator = this.#isModeratorFlag(flag);
			const localizedName = isModerator ? bold(this.#localizePermission(t, name)) : this.#localizePermission(t, name);

			if (PermissionsBits.has(permissions, flag)) {
				output.push(`${isModerator ? '🔸' : '🔹'} ${localizedName}`);
			} else {
				output.push(`-# ◾ ${localizedName}`);
			}
		}

		return output.join('\n');
	}

	#isModeratorFlag(flag: bigint) {
		return PermissionsBits.any(flag, ModeratorPermissionsBits);
	}

	#localizePermission(t: Translator, name: string) {
		return t(`permissions:${name}` as TranslationKey);
	}
}
