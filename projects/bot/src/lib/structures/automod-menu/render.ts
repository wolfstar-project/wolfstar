import { AutoModerationRoot, AutoModerationRuleTypeKeys, getPunishment, getRuleList } from '#lib/moderation/automod/commands';
import { MaximumAutoModerationRuleIgnored } from '#lib/moderation/automod/validation';
import { AutoModerationOnInfraction } from '#lib/moderation/structures/AutoModerationOnInfraction';
import {
	AutoModerationMenuInputId,
	AutoModerationMenuSoftActions,
	AutoModerationMenuEscalationInputs,
	AutoModerationMenuTimingInputs,
	formatAutoModerationMenuDuration,
	formatAutoModerationMenuEscalation,
	getAutoModerationMenuRevision,
	getAutoModerationMenuNumberFields
} from '#lib/structures/automod-menu/actions';
import {
	AutoModerationMenuSections,
	encodeAutoModerationMenuId,
	type AutoModerationMenuAction,
	type AutoModerationMenuSection,
	type AutoModerationMenuVerb
} from '#lib/structures/automod-menu/ids';
import { translateKey, type TranslationKey } from '#lib/structures/commands/utils';
import { encodeSettingsMenuId } from '#lib/structures/settings-menu/ids';
import { channelMention, codeBlock, inlineCode, roleMention } from '@discordjs/formatters';
import { cutText, isNullishOrZero } from '@sapphire/utilities';
import type { TFunction } from '@wolfstar/plugin-i18next';
import {
	ButtonStyle,
	ChannelType,
	ComponentType,
	MessageFlags,
	SelectMenuDefaultValueType,
	TextInputStyle,
	type APIActionRowComponent,
	type APIButtonComponentWithCustomId,
	type APIComponentInContainer,
	type APIComponentInMessageActionRow,
	type APIInteractionResponseCallbackData,
	type APIModalInteractionResponseCallbackData,
	type APISectionComponent,
	type APITextDisplayComponent,
	type APITextInputComponent,
	type Snowflake
} from 'discord-api-types/v10';
import {
	AutoModerationHardActions,
	AutoModerationRuleTypes,
	getDefaultAutoModerationRuleOptions,
	MaximumAutoModerationRuleListLength,
	MaximumAutoModerationRuleNameLength,
	MaximumAutoModerationRules,
	type AutoModerationRule,
	type AutoModerationRuleType,
	type ReadonlyGuildData
} from 'wolfstar-database';

const Root = AutoModerationRoot;
const AccentColor = 0x5865f2;

/**
 * The most values a select menu takes, and so the most exemptions one can edit.
 */
const MaximumSelectValues = 25;

/**
 * The most characters of a list the menu shows, a message holds 4000 in all its texts.
 */
const MaximumListLength = 1500;

const SectionEmojis: Record<AutoModerationMenuSection, string> = { options: '📝', response: '🛡️', exempt: '📜' };

export interface AutoModerationMenuContext {
	/**
	 * The function to translate with.
	 */
	t: TFunction;

	/**
	 * The user who opened the menu, the only one that can use it.
	 */
	ownerId: Snowflake;
}

/**
 * The body of a message of the auto-moderation menu, which is made of components only.
 */
export type AutoModerationMenuMessage = Pick<APIInteractionResponseCallbackData, 'components' | 'flags' | 'allowed_mentions'>;

/**
 * The settings of the auto-moderation of a server the menu shows next to its rules.
 */
export type AutoModerationMenuSettings = Pick<ReadonlyGuildData, 'modulesAutomod' | 'automodChannel' | 'automodTrackNative'>;

export interface RenderAutoModerationRulesOptions {
	/**
	 * The settings of the auto-moderation of the server.
	 */
	settings: AutoModerationMenuSettings;

	/**
	 * What to tell the user above the rules, for example that the rule they were on is gone.
	 */
	notice?: string;
}

/**
 * Renders the auto-moderation of a server: its rules with the select menu that opens one, and its settings (whether
 * the module is on, the channel it logs to, whether it reports what the AutoMod of Discord does).
 *
 * @param context - The context of the menu.
 * @param rules - The rules of the server.
 */
export function renderAutoModerationRules(
	context: AutoModerationMenuContext,
	rules: readonly AutoModerationRule[],
	{ settings, notice }: RenderAutoModerationRulesOptions
): AutoModerationMenuMessage {
	const { t, ownerId } = context;
	const body: APIComponentInContainer[] = [
		text(
			`## 🛡️ ${translateKey(t, `${Root}:menuTitle`, { count: rules.length, maximum: MaximumAutoModerationRules })}\n${translateKey(t, `${Root}:menuSubtitle`)}`
		)
	];
	if (notice !== undefined) body.push(text(`-# ${notice}`));
	body.push({ type: ComponentType.Separator });

	if (rules.length === 0) {
		body.push(text(translateKey(t, `${Root}:listEmpty`, { command: inlineCode('/automod create') })));
	} else {
		const lines = rules.map(
			(rule) => `${rule.enabled ? '🟢' : '🔴'} **${rule.name}** · ${translateKey(t, AutoModerationRuleTypeKeys[rule.type])}`
		);
		body.push(
			text(lines.join('\n')),
			row([
				{
					type: ComponentType.StringSelect,
					custom_id: encodeAutoModerationMenuId({ ownerId, verb: 'pick' }),
					placeholder: cutText(translateKey(t, `${Root}:menuRulePlaceholder`), 150),
					options: rules.slice(0, MaximumSelectValues).map((rule) => ({
						label: cutText(rule.name, 100),
						description: cutText(translateKey(t, AutoModerationRuleTypeKeys[rule.type]), 100),
						value: rule.id,
						emoji: { name: rule.enabled ? '🟢' : '🔴' }
					}))
				}
			])
		);
	}

	// The type of the rule to create is picked here, and its name is asked for in a modal:
	if (rules.length < MaximumAutoModerationRules) {
		body.push(
			row([
				{
					type: ComponentType.StringSelect,
					custom_id: encodeAutoModerationMenuId({ ownerId, verb: 'create' }),
					placeholder: cutText(`➕ ${translateKey(t, `${Root}:menuCreatePlaceholder`)}`, 150),
					options: AutoModerationRuleTypes.map((type) => ({
						label: cutText(translateKey(t, AutoModerationRuleTypeKeys[type]), 100),
						description: cutText(
							translateKey(
								t,
								`${AutoModerationRuleTypeKeys[type]}Description` as TranslationKey,
								getDefaultAutoModerationRuleOptions(type)
							),
							100
						),
						value: type
					}))
				}
			])
		);
	}

	const setting = (argument: string) => encodeAutoModerationMenuId({ ownerId, verb: 'setting', argument });
	const channel = settings.automodChannel;
	body.push(
		{ type: ComponentType.Separator },
		text(`### ⚙️ ${translateKey(t, `${Root}:menuGuildTitle`)}`),
		renderSwitch(
			t,
			translateKey(t, `${Root}:menuGuildModule`),
			translateKey(t, 'settings:modulesAutomod'),
			settings.modulesAutomod,
			setting('module')
		),
		renderSwitch(
			t,
			translateKey(t, `${Root}:menuGuildNative`),
			translateKey(t, 'settings:automodTrackNative'),
			settings.automodTrackNative,
			setting('native')
		),
		text(
			`**${translateKey(t, `${Root}:menuGuildChannel`)}**\n${channel ? channelMention(channel) : translateKey(t, `${Root}:menuGuildChannelNone`)}\n-# ${translateKey(t, 'settings:automodChannel')}`
		),
		row([
			{
				type: ComponentType.ChannelSelect,
				custom_id: setting('channel'),
				placeholder: cutText(translateKey(t, `${Root}:menuGuildChannelPlaceholder`), 150),
				channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
				min_values: 0,
				max_values: 1,
				default_values: channel ? [{ id: channel, type: SelectMenuDefaultValueType.Channel }] : []
			}
		])
	);

	body.push(
		{ type: ComponentType.Separator },
		row([
			button(encodeAutoModerationMenuId({ ownerId, verb: 'list' }), { emoji: '🔄' }),
			// The page of the settings menu the rules are opened from:
			button(encodeSettingsMenuId({ ownerId, verb: 'view', target: 'automod', page: 0 }), {
				label: translateKey(t, `${Root}:menuSettings`),
				emoji: '⚙️'
			})
		])
	);

	return toMessage(body);
}

export interface RenderAutoModerationRuleOptions {
	/**
	 * What to tell the user above the section, for example how many entries a modal changed.
	 */
	notice?: string;

	/**
	 * Whether the user asked to delete the rule, and is shown the buttons to confirm it.
	 */
	confirmDelete?: boolean;
}

/**
 * Renders a rule: its name and its status, one of its sections, the select menu that switches between them, and the
 * buttons to go back to the rules and to delete it.
 *
 * @param context - The context of the menu.
 * @param rule - The rule to render.
 * @param section - The section of the rule to render.
 */
export function renderAutoModerationRule(
	context: AutoModerationMenuContext,
	rule: AutoModerationRule,
	section: AutoModerationMenuSection,
	options: RenderAutoModerationRuleOptions = {}
): AutoModerationMenuMessage {
	const { t } = context;
	const id = createId(context, rule, section);
	const type = translateKey(t, AutoModerationRuleTypeKeys[rule.type]);
	const description = translateKey(t, `${AutoModerationRuleTypeKeys[rule.type]}Description` as TranslationKey, rule.options);

	const body: APIComponentInContainer[] = [
		block(
			`## ${rule.name}\n${translateKey(t, `${Root}:menuRuleDetails`, { id: inlineCode(rule.id), type: inlineCode(type) })}\n-# ${description}`,
			button(id('edit', 'name'), { label: translateKey(t, `${Root}:menuRename`), emoji: '✏️', style: ButtonStyle.Primary })
		),
		block(
			`**${translateKey(t, `${Root}:menuStatus`)}**\n${rule.enabled ? '🟢' : '🔴'} ${translateKey(t, rule.enabled ? `${Root}:menuEnabled` : `${Root}:menuDisabled`)}`,
			button(id('toggle', 'enabled'), {
				label: translateKey(t, rule.enabled ? `${Root}:menuDisable` : `${Root}:menuEnable`),
				style: rule.enabled ? ButtonStyle.Secondary : ButtonStyle.Success
			})
		)
	];
	if (options.notice !== undefined) body.push(text(`-# ${options.notice}`));
	body.push({ type: ComponentType.Separator });

	switch (section) {
		case 'options':
			body.push(...renderOptions(context, rule, id));
			break;
		case 'response':
			body.push(...renderResponse(context, rule, id));
			break;
		case 'exempt':
			body.push(...renderExemptions(context, rule, id));
			break;
	}

	body.push(
		{ type: ComponentType.Separator },
		row([
			{
				type: ComponentType.StringSelect,
				custom_id: id('section'),
				placeholder: cutText(translateKey(t, `${Root}:menuSectionPlaceholder`), 150),
				options: AutoModerationMenuSections.map((entry) => ({
					label: cutText(translateKey(t, SectionKeys[entry]), 100),
					description: cutText(translateKey(t, `${SectionKeys[entry]}Description` as TranslationKey), 100),
					value: entry,
					emoji: { name: SectionEmojis[entry] },
					default: entry === section
				}))
			}
		])
	);

	if (options.confirmDelete) {
		body.push(
			text(`⚠️ ${translateKey(t, `${Root}:menuDeleteConfirm`, { name: rule.name })}`),
			row([
				button(id('confirm'), { label: translateKey(t, `${Root}:menuDeleteConfirmButton`), emoji: '🗑️', style: ButtonStyle.Danger }),
				button(id('view'), { label: translateKey(t, `${Root}:menuCancel`) })
			])
		);
	} else {
		body.push(
			row([
				button(encodeAutoModerationMenuId({ ownerId: context.ownerId, verb: 'list' }), {
					label: translateKey(t, `${Root}:menuRules`),
					emoji: '◀️'
				}),
				button(id('view'), { emoji: '🔄' }),
				button(id('delete'), { label: translateKey(t, `${Root}:menuDelete`), emoji: '🗑️', style: ButtonStyle.Danger })
			])
		);
	}

	return toMessage(body);
}

const SectionKeys = {
	options: `${Root}:menuSectionOptions`,
	response: `${Root}:menuSectionResponse`,
	exempt: `${Root}:menuSectionExempt`
} as const satisfies Record<AutoModerationMenuSection, TranslationKey>;

type IdFactory = (verb: AutoModerationMenuVerb, argument?: string) => string;

function createId(context: AutoModerationMenuContext, rule: AutoModerationRule, section: AutoModerationMenuSection): IdFactory {
	return (verb, argument = '') => encodeAutoModerationMenuId({ ownerId: context.ownerId, verb, ruleId: rule.id, section, argument });
}

/**
 * What the rule looks for: its list with the buttons that edit it, or its numbers with the button that opens their
 * modal.
 */
function renderOptions({ t }: AutoModerationMenuContext, rule: AutoModerationRule, id: IdFactory): APIComponentInContainer[] {
	const body: APIComponentInContainer[] = [];

	const list = getRuleList(rule);
	if (list !== null) {
		const title = translateKey(t, `${Root}:menuListCount`, {
			title: translateKey(t, `${Root}:menuList${rule.type}` as TranslationKey),
			count: list.length,
			maximum: MaximumAutoModerationRuleListLength
		});
		body.push(
			text(`### ${title}\n${renderList(t, list)}`),
			row([
				button(id('edit', 'add'), {
					label: translateKey(t, `${Root}:menuListAdd`),
					emoji: '➕',
					style: ButtonStyle.Primary,
					disabled: list.length >= MaximumAutoModerationRuleListLength
				}),
				button(id('edit', 'remove'), { label: translateKey(t, `${Root}:menuListRemove`), emoji: '➖', disabled: list.length === 0 }),
				button(id('clear'), {
					label: translateKey(t, `${Root}:menuListClear`),
					emoji: '🗑️',
					style: ButtonStyle.Danger,
					disabled: list.length === 0
				})
			])
		);
	}

	const fields = getAutoModerationMenuNumberFields(rule);
	if (fields.length > 0) {
		const lines = fields.map((field) => `**${translateKey(t, field.label)}**\n${inlineCode(String(field.value))}`);
		body.push(block(lines.join('\n'), button(id('edit', 'numbers'), { label: translateKey(t, `${Root}:menuEdit`), emoji: '✏️' })));
	}

	if (rule.type === 'NoMentionSpam') {
		const { alerts } = (rule as AutoModerationRule<'NoMentionSpam'>).options;
		body.push(renderKeySwitch(t, `${Root}:menuOptionAlerts`, alerts, id('toggle', 'alerts')));
	}

	if (body.length === 0) body.push(text(translateKey(t, `${Root}:menuNoOptions`)));
	return body;
}

function renderList(t: TFunction, list: readonly string[]): string {
	if (list.length === 0) return translateKey(t, `${Root}:menuListEmpty`);

	const shown: string[] = [];
	let length = 0;
	for (const entry of list) {
		length += entry.length + 2;
		if (length > MaximumListLength) break;
		// An entry cannot close the block it is written in:
		shown.push(entry.replaceAll('`', "'"));
	}

	const hidden = list.length - shown.length;
	const more = hidden > 0 ? `\n-# ${translateKey(t, `${Root}:menuListMore`, { count: hidden })}` : '';
	return `${codeBlock(shown.join(', '))}${more}`;
}

/**
 * What the rule does: the three soft actions as switches, and the punishment with its select menu and the button that
 * opens the modal of its duration and its threshold.
 */
function renderResponse({ t }: AutoModerationMenuContext, rule: AutoModerationRule, id: IdFactory): APIComponentInContainer[] {
	const has = (bit: number) => AutoModerationOnInfraction.has(rule.softAction, bit);
	const body: APIComponentInContainer[] = [
		renderKeySwitch(t, `${Root}:menuResponseDelete`, has(AutoModerationMenuSoftActions.delete), id('toggle', 'delete')),
		renderKeySwitch(t, `${Root}:menuResponseAlert`, has(AutoModerationMenuSoftActions.alert), id('toggle', 'alert')),
		renderKeySwitch(t, `${Root}:menuResponseLog`, has(AutoModerationMenuSoftActions.log), id('toggle', 'log')),
		{ type: ComponentType.Separator }
	];

	// The mention spam rule bans by itself, it has no punishment to configure:
	if (rule.type === 'NoMentionSpam') {
		body.push(text(`**${translateKey(t, `${Root}:menuPunishment`)}**\n${translateKey(t, `${Root}:menuPunishmentAutomatic`)}`));
		return body;
	}

	body.push(
		text(`**${translateKey(t, `${Root}:menuPunishment`)}**`),
		row([
			{
				type: ComponentType.StringSelect,
				custom_id: id('punishment'),
				placeholder: cutText(translateKey(t, `${Root}:menuPunishmentPlaceholder`), 150),
				options: AutoModerationHardActions.map((action) => ({
					label: cutText(translateKey(t, getPunishment(action).key), 100),
					value: action,
					default: action === rule.hardAction
				}))
			}
		]),
		block(
			`**${translateKey(t, `${Root}:menuDuration`)}**\n${renderDuration(t, rule)}`,
			button(id('edit', 'duration'), { label: translateKey(t, `${Root}:menuEdit`), emoji: '⏱️' })
		),
		block(
			`**${translateKey(t, `${Root}:menuThreshold`)}**\n${renderThreshold(t, rule)}\n-# ${translateKey(t, `${Root}:menuThresholdDescription`)}`,
			button(id('edit', 'threshold'), { label: translateKey(t, `${Root}:menuEdit`), emoji: '🔢' })
		),
		block(
			`**${translateKey(t, `${Root}:menuEscalation`)}**\n${renderEscalation(t, rule)}\n-# ${translateKey(t, `${Root}:menuEscalationDescription`)}`,
			button(id('edit', 'escalation'), { label: translateKey(t, `${Root}:menuEdit`), emoji: '📈' })
		)
	);
	return body;
}

/**
 * How long the punishment of a rule lasts. A timeout cannot be permanent, so one without a duration says so.
 */
function renderDuration(t: TFunction, rule: AutoModerationRule): string {
	if (isNullishOrZero(rule.hardActionDuration)) {
		const permanent = translateKey(t, `${Root}:menuDurationPermanent`);
		return rule.hardAction === 'Timeout' ? `${permanent}\n-# ⚠️ ${translateKey(t, `${Root}:menuDurationTimeout`)}` : permanent;
	}

	return translateKey(t, 'globals:durationValue', { value: rule.hardActionDuration });
}

/**
 * The steps of the escalation of a rule, numbered by the time a member reaches the threshold: the hard action of the
 * rule is the first, so the steps start at the second, and the last one is repeated.
 */
function renderEscalation(t: TFunction, rule: AutoModerationRule): string {
	if (rule.escalation.length === 0) return translateKey(t, `${Root}:menuEscalationNone`);

	const lines = rule.escalation.map((step, index) => {
		const position = `${index + 2}${index === rule.escalation.length - 1 ? '+' : ''}.`;
		const name = translateKey(t, getPunishment(step.action).key);
		const duration = isNullishOrZero(step.duration) ? '' : ` · ${translateKey(t, 'globals:durationValue', { value: step.duration })}`;
		return `${inlineCode(position)} ${name}${duration}`;
	});

	const period = translateKey(t, 'globals:durationValue', { value: rule.escalationDuration });
	return `${lines.join('\n')}\n${translateKey(t, `${Root}:menuEscalationForget`, { period })}`;
}

/**
 * After how many infractions, within how long, the punishment of a rule applies.
 */
function renderThreshold(t: TFunction, rule: AutoModerationRule): string {
	// Without a threshold, or without a period to count in, the punishment applies at once, see `getState`:
	if (rule.thresholdMaximum <= 0 || rule.thresholdDuration <= 0) return translateKey(t, `${Root}:menuThresholdNone`);

	const period = translateKey(t, 'globals:durationValue', { value: rule.thresholdDuration });
	return translateKey(t, `${Root}:menuThresholdValue`, { count: rule.thresholdMaximum, period });
}

/**
 * What the rule leaves alone: the roles and the channels, each with the select menu that sets them.
 */
function renderExemptions({ t }: AutoModerationMenuContext, rule: AutoModerationRule, id: IdFactory): APIComponentInContainer[] {
	const render = (
		name: 'Roles' | 'Channels',
		ids: readonly Snowflake[],
		mention: (id: Snowflake) => string,
		select: APIComponentInMessageActionRow
	): APIComponentInContainer[] => {
		const title = `**${translateKey(t, `${Root}:menuExempt${name}`)} [${ids.length}/${MaximumAutoModerationRuleIgnored}]**`;
		const description = `-# ${translateKey(t, `${Root}:menuExempt${name}Description`)}`;
		const mentions = ids.length === 0 ? '' : `\n${cutText(ids.map((entry) => mention(entry)).join(' '), MaximumListLength)}`;

		// A select menu sets the whole list, and it only holds so many values: a longer list would lose the rest.
		if (ids.length > MaximumSelectValues) {
			const note = translateKey(t, `${Root}:menuExemptTooMany`, { maximum: MaximumSelectValues, command: inlineCode('/automod ignore') });
			return [text(`${title}${mentions}\n${description}\n-# ${note}`)];
		}

		return [text(`${title}${mentions}\n${description}`), row([select])];
	};

	return [
		...render('Roles', rule.ignoredRoles, roleMention, {
			type: ComponentType.RoleSelect,
			custom_id: id('roles', getAutoModerationMenuRevision(rule.ignoredRoles)),
			placeholder: cutText(translateKey(t, `${Root}:menuExemptRolesPlaceholder`), 150),
			min_values: 0,
			max_values: MaximumSelectValues,
			default_values: rule.ignoredRoles.slice(0, MaximumSelectValues).map((entry) => ({ id: entry, type: SelectMenuDefaultValueType.Role }))
		}),
		...render('Channels', rule.ignoredChannels, channelMention, {
			type: ComponentType.ChannelSelect,
			custom_id: id('channels', getAutoModerationMenuRevision(rule.ignoredChannels)),
			placeholder: cutText(translateKey(t, `${Root}:menuExemptChannelsPlaceholder`), 150),
			min_values: 0,
			max_values: MaximumSelectValues,
			default_values: rule.ignoredChannels
				.slice(0, MaximumSelectValues)
				.map((entry) => ({ id: entry, type: SelectMenuDefaultValueType.Channel }))
		})
	];
}

/**
 * A switch: what it is, what it does, and the button that flips it.
 */
function renderSwitch(t: TFunction, title: string, description: string, active: boolean, customId: string): APISectionComponent {
	return block(
		`**${title}**\n-# ${description}`,
		button(customId, {
			label: translateKey(t, active ? `${Root}:menuOn` : `${Root}:menuOff`),
			emoji: active ? '✅' : '⬜',
			style: active ? ButtonStyle.Success : ButtonStyle.Secondary
		})
	);
}

/**
 * The modal a verb of `edit` opens. Its custom ID is the one of the `submit` verb with the same argument.
 *
 * @param context - The context of the menu.
 * @param rule - The rule that is edited.
 * @param action - The action of the button that was clicked.
 * @returns `null` when the argument names no modal, or one the rule does not have.
 */
export function renderAutoModerationModal(
	context: AutoModerationMenuContext,
	rule: AutoModerationRule,
	action: AutoModerationMenuAction
): APIModalInteractionResponseCallbackData | null {
	const { t } = context;
	const modal = (title: TranslationKey, inputs: APITextInputComponent[]): APIModalInteractionResponseCallbackData => ({
		custom_id: encodeAutoModerationMenuId({ ...action, ownerId: context.ownerId, verb: 'submit' }),
		title: cutText(translateKey(t, title), 45),
		components: inputs.map((input) => ({ type: ComponentType.ActionRow, components: [input] }))
	});

	switch (action.argument) {
		case 'name':
			return modal(`${Root}:menuRenameTitle`, [
				input(AutoModerationMenuInputId, translateKey(t, `${Root}:menuRenameLabel`), {
					value: rule.name,
					min_length: 1,
					max_length: MaximumAutoModerationRuleNameLength
				})
			]);
		case 'add':
		case 'remove':
			if (getRuleList(rule) === null) return null;
			return modal(action.argument === 'add' ? `${Root}:menuListAddTitle` : `${Root}:menuListRemoveTitle`, [
				input(AutoModerationMenuInputId, translateKey(t, `${Root}:menuListLabel`), { style: TextInputStyle.Paragraph, min_length: 1 })
			]);
		case 'numbers': {
			const fields = getAutoModerationMenuNumberFields(rule);
			if (fields.length === 0) return null;
			return modal(
				`${Root}:menuNumbersTitle`,
				fields.map((field) =>
					input(field.key, translateKey(t, field.label), {
						value: String(field.value),
						placeholder: `${field.minimum} - ${field.maximum}`,
						min_length: 1,
						max_length: 6
					})
				)
			);
		}
		case 'duration':
			if (rule.type === 'NoMentionSpam') return null;
			return modal(`${Root}:menuDuration`, [
				input(AutoModerationMenuTimingInputs.duration, translateKey(t, `${Root}:menuTimingDuration`), {
					value: formatAutoModerationMenuDuration(rule.hardActionDuration),
					placeholder: '1d 12h',
					required: false,
					max_length: 30
				})
			]);
		case 'escalation':
			if (rule.type === 'NoMentionSpam') return null;
			return modal(`${Root}:menuEscalation`, [
				input(AutoModerationMenuEscalationInputs.steps, translateKey(t, `${Root}:menuEscalationSteps`), {
					style: TextInputStyle.Paragraph,
					value: formatAutoModerationMenuEscalation(rule.escalation),
					placeholder: 'timeout 1h\ntimeout 1d\nkick\nban',
					required: false,
					max_length: 500
				}),
				input(AutoModerationMenuEscalationInputs.period, translateKey(t, `${Root}:menuEscalationPeriod`), {
					value: formatAutoModerationMenuDuration(rule.escalationDuration),
					placeholder: '1d',
					required: false,
					max_length: 30
				})
			]);
		case 'threshold':
			if (rule.type === 'NoMentionSpam') return null;
			return modal(`${Root}:menuThreshold`, [
				input(AutoModerationMenuTimingInputs.threshold, translateKey(t, `${Root}:menuTimingThreshold`), {
					value: String(rule.thresholdMaximum),
					placeholder: '10',
					min_length: 1,
					max_length: 3
				}),
				input(AutoModerationMenuTimingInputs.period, translateKey(t, `${Root}:menuTimingPeriod`), {
					value: formatAutoModerationMenuDuration(rule.thresholdDuration),
					placeholder: '1m',
					required: false,
					max_length: 30
				})
			]);
		default:
			return null;
	}
}

/**
 * A switch whose description is the `Description` key next to the one of its title.
 */
function renderKeySwitch(t: TFunction, key: TranslationKey, active: boolean, customId: string): APISectionComponent {
	return renderSwitch(t, translateKey(t, key), translateKey(t, `${key}Description` as TranslationKey), active, customId);
}

/**
 * The modal that asks for the name of the rule to create. Its custom ID carries the type where a rule has its ID.
 *
 * @param context - The context of the menu.
 * @param type - The type picked in the select menu.
 */
export function renderAutoModerationCreateModal(
	context: AutoModerationMenuContext,
	type: AutoModerationRuleType
): APIModalInteractionResponseCallbackData {
	const { t } = context;
	return {
		custom_id: encodeAutoModerationMenuId({ ownerId: context.ownerId, verb: 'submit', ruleId: type, argument: 'create' }),
		title: cutText(translateKey(t, `${Root}:menuCreateTitle`, { type: translateKey(t, AutoModerationRuleTypeKeys[type]) }), 45),
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					input(AutoModerationMenuInputId, translateKey(t, `${Root}:menuRenameLabel`), {
						min_length: 1,
						max_length: MaximumAutoModerationRuleNameLength
					})
				]
			}
		]
	};
}

function input(customId: string, label: string, options: Partial<APITextInputComponent>): APITextInputComponent {
	const { value, ...rest } = options;
	return {
		type: ComponentType.TextInput,
		custom_id: customId,
		label: cutText(label, 45),
		style: TextInputStyle.Short,
		required: true,
		...rest,
		// Discord rejects an empty value:
		...(value ? { value } : {})
	};
}

function toMessage(components: APIComponentInContainer[]): AutoModerationMenuMessage {
	// The exemptions mention roles and channels, which must not ping anybody:
	return {
		components: [{ type: ComponentType.Container, accent_color: AccentColor, components }],
		flags: MessageFlags.IsComponentsV2,
		allowed_mentions: { parse: [] }
	};
}

function text(content: string): APITextDisplayComponent {
	return { type: ComponentType.TextDisplay, content };
}

function block(content: string, accessory: APIButtonComponentWithCustomId): APISectionComponent {
	return { type: ComponentType.Section, components: [text(content)], accessory };
}

function row<T extends APIComponentInMessageActionRow>(components: T[]): APIActionRowComponent<T> {
	return { type: ComponentType.ActionRow, components };
}

interface ButtonOptions {
	label?: string;
	emoji?: string;
	style?: APIButtonComponentWithCustomId['style'];
	disabled?: boolean;
}

function button(customId: string, options: ButtonOptions): APIButtonComponentWithCustomId {
	return {
		type: ComponentType.Button,
		custom_id: customId,
		style: options.style ?? ButtonStyle.Secondary,
		...(options.label === undefined ? {} : { label: cutText(options.label, 80) }),
		...(options.emoji === undefined ? {} : { emoji: { name: options.emoji } }),
		...(options.disabled ? { disabled: true } : {})
	};
}
