import { readSettings, readSettingsAdder } from '#lib/database';
import { type AutoModerationHardAction, type ReadonlyGuildData } from 'wolfstar-database';
import type { Adder } from '#lib/database/utils/Adder';
import { AutoModerationCommand, registerAutoModerationSubcommand } from '#lib/moderation/structures/AutoModerationCommand';
import { AutoModerationOnInfraction } from '#lib/moderation/structures/AutoModerationOnInfraction';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type TranslationKey } from '#lib/structures/commands/utils';
import { Colors, Emojis } from '#utils/constants';
import { EmbedBuilder, strikethrough } from '@discordjs/builders';
import { isNullish, isNullishOrZero } from '@sapphire/utilities';
import { applyLocalizedBuilder, getSupportedUserLanguageT, type TFunction } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';

const Root = 'commands/auto-moderation';

/**
 * The `show` subcommand of an auto-moderation rule command.
 *
 * @example
 * ```typescript
 * const rule = AutoModerationRules.links;
 *
 * \@AutoModerationShowCommand.register(rule)
 * export class UserCommand extends AutoModerationShowCommand {}
 * ```
 */
export abstract class AutoModerationShowCommand extends AutoModerationCommand {
	/**
	 * Registers the decorated class as the `show` subcommand of a rule, and gives it the rule as options.
	 *
	 * @param rule - The rule the subcommand shows.
	 */
	public static register(rule: AutoModerationCommand.Rule) {
		return registerAutoModerationSubcommand(rule, (builder) => applyLocalizedBuilder(builder, `${Root}:show`));
	}

	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: AutoModerationCommand.Interaction) {
		const settings = await readSettings(interaction.guildId);

		const t = getSupportedUserLanguageT(interaction);
		const embed = settings[this.keyEnabled] //
			? this.showEnabled(t, settings)
			: this.showDisabled(t);
		return interaction.reply({ embeds: [embed.toJSON()], flags: MessageFlags.Ephemeral });
	}

	protected showDisabled(t: TFunction) {
		return new EmbedBuilder() //
			.setColor(Colors.Red)
			.setTitle(translateKey(t, `${Root}:showDisabled`));
	}

	protected showEnabled(t: TFunction, settings: ReadonlyGuildData) {
		const embed = new EmbedBuilder() //
			.setColor(Colors.Green)
			.setTitle(translateKey(t, `${Root}:showEnabled`))
			.setDescription(this.showEnabledOnInfraction(t, settings[this.keyOnInfraction]));

		const punishment = settings[this.keyPunishment];
		if (!isNullish(punishment)) {
			embed.addFields({
				name: translateKey(t, `${Root}:showPunishmentTitle`),
				value: this.showEnabledOnPunishment(
					t,
					punishment,
					settings[this.keyPunishmentDuration],
					readSettingsAdder(settings, this.adderPropertyName)
				)
			});
		}

		return embed;
	}

	protected showEnabledOnInfraction(t: TFunction, value: number) {
		const replyLine = AutoModerationOnInfraction.has(value, AutoModerationOnInfraction.flags.Alert)
			? translateKey(t, `${Root}:showReplyActive`, { emoji: Emojis.Reply })
			: translateKey(t, `${Root}:showReplyInactive`, { emoji: Emojis.ReplyInactive });
		const logLine = AutoModerationOnInfraction.has(value, AutoModerationOnInfraction.flags.Log)
			? translateKey(t, `${Root}:showLogActive`, { emoji: Emojis.Flag })
			: translateKey(t, `${Root}:showLogInactive`, { emoji: Emojis.FlagInactive });
		const deleteLine = AutoModerationOnInfraction.has(value, AutoModerationOnInfraction.flags.Delete)
			? translateKey(t, `${Root}:showDeleteActive`, { emoji: Emojis.Delete })
			: translateKey(t, `${Root}:showDeleteInactive`, { emoji: Emojis.DeleteInactive });

		return `${replyLine}\n${logLine}\n${deleteLine}`;
	}

	protected showEnabledOnPunishment(
		t: TFunction,
		punishment: AutoModerationHardAction & string,
		punishmentDuration: bigint | number | null,
		adder: Adder<string> | null
	): string {
		const { key, emoji } = this.showEnabledOnPunishmentNameKey(punishment);
		const name = translateKey(t, key);
		let line: string;
		if (isNullishOrZero(punishmentDuration)) {
			line = translateKey(t, `${Root}:showPunishment`, { name, emoji });
			// Add strikethrough if the punishment is a timeout and the duration is not set:
			if (punishment === 'Timeout') line = strikethrough(line);
		} else {
			line = translateKey(t, `${Root}:showPunishmentTemporary`, {
				name,
				emoji,
				duration: translateKey(t, 'globals:durationValue', { value: Number(punishmentDuration) })
			});
		}

		return isNullish(adder) ? line : `${line}\n${this.showEnabledOnPunishmentThreshold(t, adder)}`;
	}

	protected showEnabledOnPunishmentNameKey(punishment: AutoModerationHardAction & string): { key: TranslationKey; emoji: string } {
		switch (punishment) {
			case 'Ban':
				return { key: 'moderation:typeBan', emoji: Emojis.Ban };
			case 'Kick':
				return { key: 'moderation:typeKick', emoji: Emojis.Kick };
			case 'Timeout':
				return { key: 'moderation:typeTimeout', emoji: Emojis.Timeout };
			case 'VoiceKick':
				return { key: 'moderation:typeVoiceKick', emoji: Emojis.Kick };
			case 'Softban':
				return { key: 'moderation:typeSoftban', emoji: Emojis.Softban };
			case 'Warning':
				return { key: 'moderation:typeWarning', emoji: Emojis.Flag };
		}
	}

	protected showEnabledOnPunishmentThreshold(t: TFunction, adder: Adder<string>): string {
		return translateKey(t, `${Root}:showPunishmentThreshold`, {
			threshold: adder.maximum,
			period: translateKey(t, 'globals:durationValue', { value: adder.duration }),
			emoji: Emojis.Bucket
		});
	}
}
