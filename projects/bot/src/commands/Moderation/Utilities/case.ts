import { getAction, type ModerationManager } from '#lib/moderation';
import { getEmbed, getTitle, getTranslationKey } from '#lib/moderation/common';
import {
	CommandPermissionLevel,
	createTranslator,
	getCommandPermissionDenial,
	type GuildChatInputInteraction,
	type TranslationKey,
	type Translator
} from '#lib/structures/commands';
import { desc, seconds } from '#utils/common';
import { BrandingColors, Emojis } from '#utils/constants';
import { getModeration } from '#utils/functions';
import { TypeVariation } from '#utils/moderationConstants';
import { resolveCase, resolveTimeSpan } from '#utils/resolvers';
import { getColor, getFullEmbedAuthor, isUserSelf } from '#utils/util';
import { EmbedBuilder, TimestampStyles, blockQuote, inlineCode, time, userMention } from '@discordjs/builders';
import { cutText, isNullish, isNullishOrEmpty, isNullishOrZero } from '@sapphire/utilities';
import { Command, RegisterCommand, RegisterSubcommand, UserError, container, type TransformedArguments } from '@wolfstar/http-framework';
import {
	applyLocalizedBuilder,
	createLocalizedChoice,
	getSupportedLanguageT,
	getSupportedUserLanguageT,
	type AnyNamespace,
	type TFunction
} from '@wolfstar/plugin-i18next';
import {
	ApplicationIntegrationType,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	type APIEmbedField,
	type APIUser
} from 'discord-api-types/v10';

const OverviewColors = [0x80f31f, 0xa5de0b, 0xc7c101, 0xe39e03, 0xf6780f, 0xfe5326, 0xfb3244];

/** The amount of entries the `list` subcommand displays in each page, as the paginated message did. */
const EntriesPerPage = 5;

/**
 * The `case` command, to view, list, edit, archive and delete the moderation cases of the guild.
 *
 * @remarks
 *
 * - This replaces the `case`, `reason`, `time`, `history` and `moderations` prefix commands, and the
 *   `case-deprecations` command that only pointed the prefix aliases to this command: the prefix aliases do not exist
 *   in the slash command stack, so that command was dropped.
 * - The paginated message of `list` is a single reply of the page given in the `page` option.
 * - `edit` with `duration` set to `0` removes the duration of the case, which is what `time --cancel` did.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/case:name', 'commands/case:description')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
)
export class UserCommand extends Command {
	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, 'commands/case:view')
			.addIntegerOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsCase').setMinValue(1).setRequired(true))
			.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsShow'))
	)
	public view(interaction: GuildChatInputInteraction, args: { case: number; show?: boolean }) {
		return this.#handle(interaction, async () => {
			const entry = await this.#getCase(interaction, args.case);
			const show = args.show ?? false;

			const deferred = await interaction.defer(show ? undefined : { flags: MessageFlags.Ephemeral });
			const embed = await getEmbed(this.#getDisplayT(interaction, show), entry);
			return deferred.update({ embeds: [embed.toJSON()] });
		});
	}

	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, 'commands/case:list')
			.addUserOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsUser'))
			.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsOverview'))
			.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsShow'))
			.addIntegerOption((option) =>
				applyLocalizedBuilder(option, 'commands/case:optionsType').addChoices(
					createLocalizedChoice('moderation:typeRoleAdd', { value: TypeVariation.RoleAdd }),
					createLocalizedChoice('moderation:typeBan', { value: TypeVariation.Ban }),
					createLocalizedChoice('moderation:typeKick', { value: TypeVariation.Kick }),
					createLocalizedChoice('moderation:typeMute', { value: TypeVariation.Mute }),
					createLocalizedChoice('moderation:typeRoleRemove', { value: TypeVariation.RoleRemove }),
					createLocalizedChoice('moderation:typeRestrictedAttachment', { value: TypeVariation.RestrictedAttachment }),
					createLocalizedChoice('moderation:typeRestrictedEmbed', { value: TypeVariation.RestrictedEmbed }),
					createLocalizedChoice('moderation:typeRestrictedEmoji', { value: TypeVariation.RestrictedEmoji }),
					createLocalizedChoice('moderation:typeRestrictedReaction', { value: TypeVariation.RestrictedReaction }),
					createLocalizedChoice('moderation:typeRestrictedVoice', { value: TypeVariation.RestrictedVoice }),
					createLocalizedChoice('moderation:typeSetNickname', { value: TypeVariation.SetNickname }),
					createLocalizedChoice('moderation:typeSoftban', { value: TypeVariation.Softban }),
					createLocalizedChoice('moderation:typeTimeout', { value: TypeVariation.Timeout }),
					createLocalizedChoice('moderation:typeVoiceKick', { value: TypeVariation.VoiceKick }),
					createLocalizedChoice('moderation:typeVoiceMute', { value: TypeVariation.VoiceMute }),
					createLocalizedChoice('moderation:typeWarning', { value: TypeVariation.Warning })
				)
			)
			.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsPendingOnly'))
			.addIntegerOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsPage').setMinValue(1))
	)
	public list(
		interaction: GuildChatInputInteraction,
		args: {
			user?: TransformedArguments.User;
			overview?: boolean;
			show?: boolean;
			type?: TypeVariation;
			'pending-only'?: boolean;
			page?: number;
		}
	) {
		return this.#handle(interaction, async (t) => {
			const show = args.show ?? false;
			const user = args.user?.user ?? null;

			const moderation = getModeration(interaction.guildId);
			let entries = [...(await moderation.fetch({ userId: user?.id })).values()];
			if (!isNullish(args.type)) entries = entries.filter((entry) => entry.type === args.type);
			if (args['pending-only'] ?? false) entries = entries.filter((entry) => !isNullishOrZero(entry.duration) && !entry.isCompleted());

			const displayT = this.#getDisplayT(interaction, show);
			if (args.overview) {
				const deferred = await interaction.defer(show ? undefined : { flags: MessageFlags.Ephemeral });
				return deferred.update({ embeds: [this.#listOverview(displayT, entries, user).toJSON()] });
			}

			if (entries.length === 0) throw t('commands/case:listEmpty');

			const deferred = await interaction.defer(show ? undefined : { flags: MessageFlags.Ephemeral });
			const embed = await this.#listDetails(interaction, displayT, this.#sortEntries(entries), user === null, args.page ?? 1);
			return deferred.update({ embeds: [embed.toJSON()] });
		});
	}

	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, 'commands/case:edit')
			.addIntegerOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsCase').setMinValue(1).setRequired(true))
			.addStringOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsReason').setMaxLength(200))
			.addStringOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsDuration').setMaxLength(50))
	)
	public edit(interaction: GuildChatInputInteraction, args: { case: number; reason?: string; duration?: string }) {
		return this.#handle(interaction, async (t) => {
			const entry = await this.#getCase(interaction, args.case);
			const duration = this.#getDuration(t, entry, args.duration);

			if (!isNullish(duration)) {
				const action = getAction(entry.type);
				if (!action.isUndoActionAvailable) {
					throw t('commands/case:timeNotAllowed', { type: t(getTranslationKey(entry.type)) });
				}

				if (entry.isCompleted()) {
					throw t('commands/case:timeNotAllowedInCompletedEntries', { caseId: entry.id });
				}

				if (duration !== 0) {
					const next = entry.createdAt + duration;
					if (next <= Date.now()) {
						throw t('commands/case:timeTooEarly', {
							start: time(seconds.fromMilliseconds(entry.createdAt), TimestampStyles.LongDateTime),
							time: time(seconds.fromMilliseconds(next), TimestampStyles.RelativeTime)
						});
					}
				}
			}

			await getModeration(interaction.guildId).edit(entry, {
				reason: isNullish(args.reason) ? entry.reason : args.reason,
				duration: isNullish(duration) ? entry.duration : duration || null
			});

			return interaction.reply({ content: t('commands/case:editSuccess', { caseId: entry.id }), flags: MessageFlags.Ephemeral });
		});
	}

	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, 'commands/case:archive') //
			.addIntegerOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsCase').setMinValue(1).setRequired(true))
	)
	public archive(interaction: GuildChatInputInteraction, args: { case: number }) {
		return this.#handle(interaction, async (t) => {
			const entry = await this.#getCase(interaction, args.case);
			await getModeration(interaction.guildId).archive(entry);

			return interaction.reply({ content: t('commands/case:archiveSuccess', { caseId: entry.id }), flags: MessageFlags.Ephemeral });
		});
	}

	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, 'commands/case:delete') //
			.addIntegerOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsCase').setMinValue(1).setRequired(true))
	)
	public delete(interaction: GuildChatInputInteraction, args: { case: number }) {
		return this.#handle(interaction, async (t) => {
			const entry = await this.#getCase(interaction, args.case);
			await getModeration(interaction.guildId).delete(entry);

			return interaction.reply({ content: t('commands/case:deleteSuccess', { caseId: entry.id }), flags: MessageFlags.Ephemeral });
		});
	}

	/**
	 * Checks the permission level of the author, then runs the handler.
	 *
	 * @remarks
	 *
	 * The handler must throw the translated message (or a `UserError`) **before** it defers the interaction, as the
	 * errors are sent as an ephemeral reply.
	 */
	async #handle(interaction: GuildChatInputInteraction, handler: (t: Translator) => Promise<unknown>) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Moderator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		try {
			return await handler(t);
		} catch (error) {
			if (typeof error === 'string') return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
			if (error instanceof UserError) {
				const content = t(error.identifier as TranslationKey, error.context as Record<string, unknown>);
				return interaction.reply({ content, flags: MessageFlags.Ephemeral });
			}

			throw error;
		}
	}

	/**
	 * Gets the function to translate the displayed output with, the language of the guild if the output is public and
	 * the language of the author otherwise.
	 */
	#getDisplayT(interaction: GuildChatInputInteraction, show: boolean) {
		return (show ? getSupportedLanguageT(interaction) : getSupportedUserLanguageT(interaction)) as unknown as TFunction<AnyNamespace>;
	}

	async #listDetails(
		interaction: GuildChatInputInteraction,
		t: TFunction<AnyNamespace>,
		entries: ModerationManager.Entry[],
		displayUser: boolean,
		requestedPage: number
	) {
		const pages = Math.ceil(entries.length / EntriesPerPage);
		const page = Math.min(requestedPage, pages);
		const slice = entries.slice((page - 1) * EntriesPerPage, page * EntriesPerPage);

		const member = await container.gatewayClient.members.fetch(interaction.guildId, interaction.user.id).catch(() => null);
		const color = member ? await getColor({ member }) : BrandingColors.Primary;
		return new EmbedBuilder()
			.setTitle(t('commands/case:listDetailsTitle', { count: entries.length }))
			.setColor(color)
			.setFooter({ text: t('commands/case:listDetailsPage', { page, pages }) })
			.addFields(slice.map((entry) => this.#listDetailsEntry(t, entry, displayUser)));
	}

	#listDetailsEntry(t: TFunction<AnyNamespace>, entry: ModerationManager.Entry, displayUser: boolean): APIEmbedField {
		const moderatorEmoji = isUserSelf(entry.moderatorId) ? Emojis.AutoModerator : Emojis.Moderator;
		const lines = [
			`${Emojis.Calendar} ${time(seconds.fromMilliseconds(entry.createdAt), TimestampStyles.ShortDateTime)}`,
			t('commands/case:listDetailsModerator', { emoji: moderatorEmoji, mention: userMention(entry.moderatorId), userId: entry.moderatorId })
		];
		if (displayUser && entry.userId) {
			lines.push(t('commands/case:listDetailsUser', { emoji: Emojis.ShieldMember, mention: userMention(entry.userId), userId: entry.userId }));
		}

		if (!isNullishOrZero(entry.duration) && !entry.expired) {
			const timestamp = time(seconds.fromMilliseconds(entry.expiresTimestamp!), TimestampStyles.RelativeTime);
			lines.push(t('commands/case:listDetailsExpires', { emoji: Emojis.Hourglass, time: timestamp }));
		}

		if (!isNullishOrEmpty(entry.reason)) lines.push(blockQuote(cutText(entry.reason, 150)));

		return {
			name: `${inlineCode(entry.id.toString())} → ${getTitle(t, entry)}`,
			value: lines.join('\n'),
			inline: false
		};
	}

	#listOverview(t: TFunction<AnyNamespace>, entries: ModerationManager.Entry[], user: APIUser | null) {
		let [warnings, mutes, timeouts, kicks, bans] = [0, 0, 0, 0, 0];
		for (const entry of entries) {
			if (entry.isArchived() || entry.isUndo()) continue;
			switch (entry.type) {
				case TypeVariation.Ban:
				case TypeVariation.Softban:
					++bans;
					break;
				case TypeVariation.Mute:
					++mutes;
					break;
				case TypeVariation.Timeout:
					++timeouts;
					break;
				case TypeVariation.Kick:
					++kicks;
					break;
				case TypeVariation.Warning:
					++warnings;
					break;
				default:
					break;
			}
		}

		const footer = t(user ? 'commands/case:listOverviewFooterUser' : 'commands/case:listOverviewFooter', {
			warnings: t('commands/case:listOverviewFooterWarning', { count: warnings }),
			mutes: t('commands/case:listOverviewFooterMutes', { count: mutes }),
			timeouts: t('commands/case:listOverviewFooterTimeouts', { count: timeouts }),
			kicks: t('commands/case:listOverviewFooterKicks', { count: kicks }),
			bans: t('commands/case:listOverviewFooterBans', { count: bans })
		});

		const embed = new EmbedBuilder()
			.setColor(OverviewColors[Math.min(OverviewColors.length - 1, warnings + mutes + kicks + bans)])
			.setFooter({ text: footer });
		if (user) embed.setAuthor(getFullEmbedAuthor(user));
		return embed;
	}

	#sortEntries(entries: ModerationManager.Entry[]) {
		return entries.sort((a, b) => desc(a.id, b.id));
	}

	/**
	 * Resolves the `duration` option.
	 *
	 * @returns `null` if the option was not given, the duration in milliseconds otherwise.
	 * @throws The translated error when the duration is not valid, or the case does not support editing it.
	 */
	#getDuration(t: Translator, entry: ModerationManager.Entry, parameter: string | undefined) {
		if (isNullishOrEmpty(parameter)) return null;

		const action = getAction(entry.type);
		if (action.durationExternal) {
			throw t('commands/case:timeEditNotSupported', { type: t(getTranslationKey(entry.type)) });
		}

		const result = resolveTimeSpan(parameter, { minimum: action.minimumDuration, maximum: action.maximumDuration });
		if (result.isOk()) return result.unwrap();

		throw translateKeyOf(t, result.unwrapErr(), { parameter, minimum: action.minimumDuration, maximum: action.maximumDuration });
	}

	async #getCase(interaction: GuildChatInputInteraction, caseId: number): Promise<ModerationManager.Entry> {
		const result = await resolveCase(
			caseId.toString(),
			getSupportedUserLanguageT(interaction) as unknown as TFunction<AnyNamespace>,
			interaction.guildId
		);
		if (result.isErr()) throw result.unwrapErr();

		return result.unwrap();
	}
}

function translateKeyOf(t: Translator, key: string, options: Record<string, unknown>) {
	return t(key as TranslationKey, options);
}
