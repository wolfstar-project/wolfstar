import {
	AutoModerationRuleError,
	findAutoModerationRule,
	getAutoModerationRuleAdder,
	getAutoModerationRuleWordFilter,
	readAutoModerationRules,
	updateAutoModerationRule
} from '#lib/moderation/automod/rules';
import { normalizeAutoModerationRuleWord } from '#lib/moderation/automod/validation';
import { AutoModerationOnInfraction } from '#lib/moderation/structures/AutoModerationOnInfraction';
import { translateKey, type GuildChatInputInteraction, type TranslationKey } from '#lib/structures/commands/utils';
import { Colors, Emojis } from '#utils/constants';
import { resolveTimeSpan } from '#utils/resolvers';
import { EmbedBuilder, strikethrough, type SlashCommandSubcommandBuilder } from '@discordjs/builders';
import { channelMention, inlineCode, roleMention } from '@discordjs/formatters';
import { isNullishOrEmpty, isNullishOrZero } from '@sapphire/utilities';
import { applyLocalizedBuilder, getSupportedUserLanguageT, type TFunction } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';
import {
	AutoModerationRuleWordLength,
	isAutoModerationRuleWord,
	MaximumAutoModerationRuleListLength,
	MaximumAutoModerationRuleNameLength,
	MaximumAutoModerationRules,
	type AutoModerationHardAction,
	type AutoModerationRule,
	type AutoModerationRuleType
} from 'wolfstar-database';

export const AutoModerationRoot = 'commands/auto-moderation';
const Root = AutoModerationRoot;

/**
 * The name of each type of rule, as the `type` choices and the messages show it.
 */
export const AutoModerationRuleTypeKeys = {
	Attachments: `${Root}:typeAttachments`,
	Capitals: `${Root}:typeCapitals`,
	Invites: `${Root}:typeInvites`,
	Links: `${Root}:typeLinks`,
	Newlines: `${Root}:typeNewlines`,
	NoMentionSpam: `${Root}:typeNoMentionSpam`,
	Words: `${Root}:typeWords`,
	Zalgo: `${Root}:typeZalgo`
} as const satisfies Record<AutoModerationRuleType, TranslationKey>;

/**
 * Adds the `rule` option, the name of a rule with autocomplete, to a subcommand.
 */
export function applyRuleOption(subcommand: SlashCommandSubcommandBuilder) {
	return subcommand.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsRule`).setRequired(true).setAutocomplete(true));
}

/**
 * Finds the rule of the `rule` option of a command, and answers the interaction when there is none.
 *
 * @returns The rule, or `null` when the interaction was answered.
 */
export async function resolveCommandRule(interaction: GuildChatInputInteraction, t: TFunction, query: string): Promise<AutoModerationRule | null> {
	const rule = findAutoModerationRule(await readAutoModerationRules(interaction.guildId), query);
	if (rule !== null) return rule;

	await interaction.reply({ content: translateKey(t, `${Root}:errorUnknown`, { rule: query }), flags: MessageFlags.Ephemeral });
	return null;
}

/**
 * Translates what went wrong when a rule was created, edited or deleted.
 *
 * @param error - What was thrown, thrown again when it is not a {@linkcode AutoModerationRuleError}.
 * @param query - What the user called the rule.
 */
export function translateRuleError(t: TFunction, error: unknown, query: string): string {
	if (!(error instanceof AutoModerationRuleError)) throw error;

	switch (error.code) {
		case 'limit':
			return translateKey(t, `${Root}:errorLimit`, { maximum: MaximumAutoModerationRules });
		case 'nameTaken':
			return translateKey(t, `${Root}:errorNameTaken`);
		case 'nameInvalid':
			return translateKey(t, `${Root}:errorNameInvalid`, { maximum: MaximumAutoModerationRuleNameLength });
		case 'unknown':
			return translateKey(t, `${Root}:errorUnknown`, { rule: query });
	}
}

/**
 * The soft actions of a rule after the `alert`, `log` and `delete` options of a command, the ones it had for the
 * options that were not given.
 */
export function resolveSoftAction(options: { alert?: boolean; log?: boolean; delete?: boolean }, existing: number): number {
	const { flags } = AutoModerationOnInfraction;

	let bitfield = 0;
	if (options.alert ?? AutoModerationOnInfraction.has(existing, flags.Alert)) bitfield |= flags.Alert;
	if (options.log ?? AutoModerationOnInfraction.has(existing, flags.Log)) bitfield |= flags.Log;
	if (options.delete ?? AutoModerationOnInfraction.has(existing, flags.Delete)) bitfield |= flags.Delete;
	return bitfield;
}

/**
 * Resolves a duration option.
 *
 * @returns `null` when the option was not given, the duration, or an object with the translated error.
 */
export function resolveDurationOption(
	t: TFunction,
	parameter: string | undefined,
	{ minimum, maximum }: { minimum: number; maximum: number }
): number | null | { error: string } {
	if (isNullishOrEmpty(parameter)) return null;

	const result = resolveTimeSpan(parameter, { minimum, maximum });
	if (result.isOk()) return result.unwrap();
	return { error: translateKey(t, result.unwrapErr() as TranslationKey, { parameter, minimum, maximum }) };
}

/**
 * The list of a rule the `add` and `remove` subcommands edit, and the entry a value stands for in it.
 *
 * @returns `null` when the type of the rule has no list.
 */
export function resolveRuleListEntry(rule: AutoModerationRule, input: string): { key: string; list: readonly string[]; value: string } | null {
	const value = input.trim();
	switch (rule.type) {
		case 'Words': {
			const { words } = (rule as AutoModerationRule<'Words'>).options;
			return { key: 'words', list: words, value: normalizeAutoModerationRuleWord(value) };
		}
		case 'Links': {
			const { allowed } = (rule as AutoModerationRule<'Links'>).options;
			// A full link stands for its hostname:
			const hostname = URL.canParse(value) ? new URL(value).hostname : value;
			return { key: 'allowed', list: allowed, value: hostname.toLowerCase() };
		}
		case 'Invites': {
			const { allowedCodes, allowedGuilds } = (rule as AutoModerationRule<'Invites'>).options;
			if (/^\d{17,20}$/.test(value)) return { key: 'allowedGuilds', list: allowedGuilds, value };
			// An invite link stands for its code:
			return { key: 'allowedCodes', list: allowedCodes, value: value.split('/').at(-1)! };
		}
		default:
			return null;
	}
}

/**
 * Runs `/automod add` and `/automod remove`: adds an entry to the list of a rule, or removes it.
 */
export async function editRuleList(interaction: GuildChatInputInteraction, options: { rule: string; value: string }, action: 'add' | 'remove') {
	const t = getSupportedUserLanguageT(interaction);
	const cached = await resolveCommandRule(interaction, t, options.rule);
	if (cached === null) return;

	// The list is edited on the rule the database has, the cached one may be behind another change:
	let content!: string;
	try {
		await updateAutoModerationRule(interaction.guildId, cached.id, (rule) => {
			const result = editRuleListEntry(t, rule, options.value, action);
			content = result.content;
			return result.list === null ? null : { options: { ...rule.options, [result.key]: result.list } as AutoModerationRule['options'] };
		});
	} catch (error) {
		content = translateRuleError(t, error, options.rule);
	}

	return interaction.reply({ content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
}

/**
 * What adding an entry to the list of a rule, or removing it, changes.
 *
 * @returns What to answer, and the list after the change, `null` when it does not change.
 */
export function editRuleListEntry(
	t: TFunction,
	rule: AutoModerationRule,
	input: string,
	action: 'add' | 'remove'
): { content: string; key: string; list: string[] | null } {
	const entry = resolveRuleListEntry(rule, input);
	if (entry === null || entry.value.length === 0) {
		const type = translateKey(t, AutoModerationRuleTypeKeys[rule.type]);
		return { content: translateKey(t, `${Root}:errorNoList`, { name: rule.name, type }), key: '', list: null };
	}

	const { key } = entry;
	const context = { name: rule.name, value: entry.value };
	const none = (content: string) => ({ content, key, list: null });

	const exists = entry.list.includes(entry.value);
	if (action === 'remove') {
		if (!exists) return none(translateKey(t, `${Root}:removeMissing`, context));
		return { content: translateKey(t, `${Root}:removeSuccess`, context), key, list: entry.list.filter((value) => value !== entry.value) };
	}

	if (exists) return none(translateKey(t, `${Root}:addExists`, context));
	if (entry.list.length >= MaximumAutoModerationRuleListLength) {
		return none(translateKey(t, `${Root}:errorListFull`, { name: rule.name, maximum: MaximumAutoModerationRuleListLength }));
	}

	if (rule.type === 'Words') {
		if (!isAutoModerationRuleWord(entry.value)) return none(translateKey(t, `${Root}:errorWordLength`, AutoModerationRuleWordLength));

		// A word another word of the list already matches would never be the one that is found:
		const filter = getAutoModerationRuleWordFilter(rule as AutoModerationRule<'Words'>);
		if (filter !== null) {
			filter.lastIndex = 0;
			const covered = filter.test(entry.value);
			filter.lastIndex = 0;
			if (covered) return none(translateKey(t, `${Root}:addCovered`, context));
		}
	}

	return { content: translateKey(t, `${Root}:addSuccess`, context), key, list: [...entry.list, entry.value] };
}

function getRuleList(rule: AutoModerationRule): readonly string[] | null {
	switch (rule.type) {
		case 'Words':
			return (rule as AutoModerationRule<'Words'>).options.words;
		case 'Links':
			return (rule as AutoModerationRule<'Links'>).options.allowed;
		case 'Invites': {
			const { allowedCodes, allowedGuilds } = (rule as AutoModerationRule<'Invites'>).options;
			return [...allowedCodes, ...allowedGuilds];
		}
		default:
			return null;
	}
}

function getPunishment(punishment: AutoModerationHardAction): { key: TranslationKey; emoji: string } {
	switch (punishment) {
		case 'Ban':
			return { key: 'moderation:typeBan', emoji: Emojis.Ban };
		case 'Kick':
			return { key: 'moderation:typeKick', emoji: Emojis.Kick };
		case 'Timeout':
			return { key: 'moderation:typeTimeout', emoji: Emojis.Timeout };
		case 'Mute':
			return { key: 'moderation:typeMute', emoji: Emojis.Timeout };
		case 'VoiceKick':
			return { key: 'moderation:typeVoiceKick', emoji: Emojis.Kick };
		case 'Softban':
			return { key: 'moderation:typeSoftban', emoji: Emojis.Softban };
		case 'Warning':
			return { key: 'moderation:typeWarning', emoji: Emojis.Flag };
	}
}

function renderSoftActions(t: TFunction, value: number) {
	const { flags } = AutoModerationOnInfraction;
	const line = (bit: number, name: 'Reply' | 'Log' | 'Delete', active: string, inactive: string) =>
		AutoModerationOnInfraction.has(value, bit)
			? translateKey(t, `${Root}:show${name}Active`, { emoji: active })
			: translateKey(t, `${Root}:show${name}Inactive`, { emoji: inactive });

	return [
		line(flags.Alert, 'Reply', Emojis.Reply, Emojis.ReplyInactive),
		line(flags.Log, 'Log', Emojis.Flag, Emojis.FlagInactive),
		line(flags.Delete, 'Delete', Emojis.Delete, Emojis.DeleteInactive)
	].join('\n');
}

function renderPunishment(t: TFunction, rule: AutoModerationRule) {
	const { key, emoji } = getPunishment(rule.hardAction);
	const name = translateKey(t, key);

	let line: string;
	if (isNullishOrZero(rule.hardActionDuration)) {
		line = translateKey(t, `${Root}:showPunishment`, { name, emoji });
		// A timeout without a duration is never applied:
		if (rule.hardAction === 'Timeout') line = strikethrough(line);
	} else {
		const duration = translateKey(t, 'globals:durationValue', { value: rule.hardActionDuration });
		line = translateKey(t, `${Root}:showPunishmentTemporary`, { name, emoji, duration });
	}

	const adder = getAutoModerationRuleAdder(rule);
	const threshold =
		adder === null
			? translateKey(t, `${Root}:showPunishmentNone`)
			: translateKey(t, `${Root}:showPunishmentThreshold`, {
					threshold: adder.maximum,
					period: translateKey(t, 'globals:durationValue', { value: adder.duration }),
					emoji: Emojis.Bucket
				});
	return `${line}\n${threshold}`;
}

/**
 * The most characters of a list a rule shows, a field of an embed holds 1024.
 */
const MaximumListLength = 900;

/**
 * Joins mentions, as many as fit in a field of an embed, followed by how many were left out.
 */
function renderMentions(ids: readonly string[], mention: (id: string) => string): string {
	const shown: string[] = [];
	let length = 0;
	for (const id of ids) {
		const text = mention(id);
		length += text.length + 1;
		if (length > MaximumListLength) break;
		shown.push(text);
	}

	const hidden = ids.length - shown.length;
	return `${shown.join(' ')}${hidden > 0 ? ` (+${hidden})` : ''}`;
}

/**
 * Renders a rule: what it looks for, what it does, and what it leaves alone.
 */
export function renderRule(t: TFunction, rule: AutoModerationRule): EmbedBuilder {
	const type = translateKey(t, AutoModerationRuleTypeKeys[rule.type]);
	const embed = new EmbedBuilder()
		.setColor(rule.enabled ? Colors.Green : Colors.Red)
		.setTitle(translateKey(t, rule.enabled ? `${Root}:showTitleEnabled` : `${Root}:showTitleDisabled`, { name: rule.name, type }))
		.setDescription(
			`${translateKey(t, `${AutoModerationRuleTypeKeys[rule.type]}Description`, rule.options)}\n\n${renderSoftActions(t, rule.softAction)}`
		);

	// The mention spam rule bans by itself, it has no punishment to configure:
	if (rule.type !== 'NoMentionSpam') {
		embed.addFields({ name: translateKey(t, `${Root}:showPunishmentTitle`), value: renderPunishment(t, rule) });
	}

	const list = getRuleList(rule);
	if (list !== null) {
		const shown: string[] = [];
		let length = 0;
		for (const entry of list) {
			length += entry.length + 4;
			if (length > MaximumListLength) break;
			shown.push(inlineCode(entry));
		}
		const hidden = list.length - shown.length;
		embed.addFields({
			name: translateKey(t, `${Root}:showListTitle`, { count: list.length }),
			value:
				list.length === 0
					? translateKey(t, `${Root}:showListEmpty`, { command: inlineCode('/automod add') })
					: `${shown.join(', ')}${hidden > 0 ? ` (+${hidden})` : ''}`
		});
	}

	if (rule.ignoredRoles.length > 0) {
		embed.addFields({ name: translateKey(t, `${Root}:showIgnoredRoles`), value: renderMentions(rule.ignoredRoles, roleMention) });
	}
	if (rule.ignoredChannels.length > 0) {
		embed.addFields({ name: translateKey(t, `${Root}:showIgnoredChannels`), value: renderMentions(rule.ignoredChannels, channelMention) });
	}

	return embed;
}

/**
 * Renders the rules of a guild as a list, one line per rule.
 */
export function renderRuleList(t: TFunction, rules: readonly AutoModerationRule[]): EmbedBuilder {
	if (rules.length === 0) {
		return new EmbedBuilder()
			.setColor(Colors.Red)
			.setDescription(translateKey(t, `${Root}:listEmpty`, { command: inlineCode('/automod create') }));
	}

	return new EmbedBuilder()
		.setColor(Colors.Blue)
		.setTitle(translateKey(t, `${Root}:listTitle`, { count: rules.length }))
		.setDescription(
			rules
				.map((rule) =>
					translateKey(t, rule.enabled ? `${Root}:listLineEnabled` : `${Root}:listLineDisabled`, {
						emoji: rule.enabled ? Emojis.GreenTick : Emojis.RedCross,
						name: rule.name,
						type: translateKey(t, AutoModerationRuleTypeKeys[rule.type])
					})
				)
				.join('\n')
		);
}
