import { getConfigurableKeys, readSettings, writeSettingsTransaction, type SchemaDataKey } from '#lib/database';
import { type GuildData, type GuildDataValue } from 'wolfstar-database';
import { AutoModerationCommand, registerAutoModerationSubcommand } from '#lib/moderation/structures/AutoModerationCommand';
import { AutoModerationOnInfraction } from '#lib/moderation/structures/AutoModerationOnInfraction';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey } from '#lib/structures/commands/utils';
import type { Awaitable } from '@sapphire/utilities';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';

const Root = 'commands/auto-moderation';

type ResetKey = 'enabled' | 'alert' | 'log' | 'delete' | 'punishment' | 'punishment-duration' | 'threshold' | 'threshold-duration';

/**
 * The `reset` subcommand of an auto-moderation rule command. The extra keys of the rule (`resetKeys`) are added to the
 * choices, and are handled by overriding {@linkcode AutoModerationResetCommand.resetGetKeyValuePairFallback}.
 *
 * @example
 * ```typescript
 * const rule = AutoModerationRules.links;
 *
 * \@AutoModerationResetCommand.register(rule)
 * class UserCommand extends AutoModerationResetCommand {}
 * ```
 */
export abstract class AutoModerationResetCommand extends AutoModerationCommand {
	/**
	 * Registers the decorated class as the `reset` subcommand of a rule, and gives it the rule as options.
	 *
	 * @param rule - The rule the subcommand resets.
	 */
	public static register(rule: AutoModerationCommand.Rule) {
		return registerAutoModerationSubcommand(rule, (builder) => {
			const choices = [
				createLocalizedChoice(`${Root}:optionsKeyEnabled`, { value: 'enabled' }),
				createLocalizedChoice(`${Root}:optionsKeyActionAlert`, { value: 'alert' }),
				createLocalizedChoice(`${Root}:optionsKeyActionLog`, { value: 'log' }),
				createLocalizedChoice(`${Root}:optionsKeyActionDelete`, { value: 'delete' }),
				createLocalizedChoice(`${Root}:optionsKeyPunishment`, { value: 'punishment' }),
				createLocalizedChoice(`${Root}:optionsKeyPunishmentDuration`, { value: 'punishment-duration' }),
				createLocalizedChoice(`${Root}:optionsKeyThreshold`, { value: 'threshold' }),
				createLocalizedChoice(`${Root}:optionsKeyThresholdPeriod`, { value: 'threshold-duration' })
			];

			for (const { key: name, value } of rule.resetKeys ?? []) {
				choices.push(createLocalizedChoice(name, { value }));
			}

			return applyLocalizedBuilder(builder, `${Root}:reset`).addStringOption((option) =>
				applyLocalizedBuilder(option, `${Root}:optionsKey`)
					.setChoices(...choices)
					.setRequired(true)
			);
		});
	}

	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: AutoModerationCommand.Interaction, options: AutoModerationCommand.ResetArguments) {
		const [key, value] = await this.resetGetKeyValuePair(interaction.guildId, options.key as ResetKey);
		using trx = await writeSettingsTransaction(interaction.guildId);
		await trx.write({ [key]: value } as Partial<GuildData>).submitWithAudit(interaction.user.id);

		const t = getSupportedUserLanguageT(interaction);
		const content = translateKey(t, `${Root}:editSuccess`);
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	protected async resetGetKeyValuePair(guildId: string, key: ResetKey): Promise<readonly [SchemaDataKey, GuildDataValue]> {
		switch (key) {
			case 'enabled':
				return [this.keyEnabled, false];
			case 'alert':
				return [this.keyOnInfraction, await this.resetGetOnInfractionFlags(guildId, AutoModerationOnInfraction.flags.Alert)];
			case 'log':
				return [this.keyOnInfraction, await this.resetGetOnInfractionFlags(guildId, AutoModerationOnInfraction.flags.Log)];
			case 'delete':
				return [this.keyOnInfraction, await this.resetGetOnInfractionFlags(guildId, AutoModerationOnInfraction.flags.Delete)];
			case 'punishment':
				return [this.keyPunishment, this.resetGetValue(this.keyPunishment)];
			case 'punishment-duration':
				return [this.keyPunishmentDuration, this.resetGetValue(this.keyPunishmentDuration)];
			case 'threshold':
				return [this.keyPunishmentThreshold, this.resetGetValue(this.keyPunishmentThreshold)];
			case 'threshold-duration':
				return [this.keyPunishmentThresholdPeriod, this.resetGetValue(this.keyPunishmentThresholdPeriod)];
			default:
				return this.resetGetKeyValuePairFallback(guildId, key);
		}
	}

	protected resetGetKeyValuePairFallback(guildId: string, key: string): Awaitable<readonly [SchemaDataKey, GuildDataValue]>;
	protected resetGetKeyValuePairFallback(): never {
		throw new Error('Unreachable');
	}

	protected resetGetValue<const Key extends SchemaDataKey>(key: Key): GuildData[Key] {
		return getConfigurableKeys().get(key)!.default as GuildData[Key];
	}

	protected async resetGetOnInfractionFlags(guildId: string, bit: number) {
		const settings = await readSettings(guildId);
		const bitfield = settings[this.keyOnInfraction];
		return AutoModerationOnInfraction.difference(bitfield, bit);
	}
}
