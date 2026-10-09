import { readSettings, writeSettings } from '#lib/database';
import { AutoModerationRoot, translateRuleError } from '#lib/moderation/automod/commands';
import {
	AutoModerationRuleError,
	createAutoModerationRule,
	deleteAutoModerationRule,
	readAutoModerationRules,
	updateAutoModerationRule,
	type AutoModerationRuleUpdate
} from '#lib/moderation/automod/rules';
import {
	AutoModerationMenuInputId,
	clearAutoModerationMenuList,
	decodeAutoModerationMenuId,
	editAutoModerationMenuList,
	isAutoModerationMenuSection,
	parseAutoModerationMenuEntries,
	parseAutoModerationMenuEscalation,
	parseAutoModerationMenuNumbers,
	parseAutoModerationMenuTiming,
	renderAutoModerationCreateModal,
	renderAutoModerationModal,
	renderAutoModerationRule,
	renderAutoModerationRules,
	setAutoModerationMenuExemptions,
	toggleAutoModerationMenuSwitch,
	type AutoModerationMenuAction,
	type AutoModerationMenuContext,
	type AutoModerationMenuSection
} from '#lib/structures/automod-menu';
import { CommandPermissionLevel, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey } from '#lib/structures/commands/utils';
import { getModalValue } from '#utils/interactions';
import { inlineCode } from '@discordjs/formatters';
import { InteractionHandler, ModalSubmitInteraction } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags, type Snowflake } from 'discord-api-types/v10';
import { AutoModerationHardActions, isAutoModerationRuleType, type AutoModerationHardAction, type AutoModerationRule } from 'wolfstar-database';

const Root = AutoModerationRoot;

type ModalInteraction = InteractionHandler.ModalInteraction;
type ComponentInteraction = Exclude<InteractionHandler.Interaction, ModalInteraction>;

/**
 * What a change answers with: what changes in the rule (`null` for nothing), and what to tell the user above it.
 */
interface Change {
	update: AutoModerationRuleUpdate | null;
	notice?: string;
}

/**
 * Handles the components and the modals of the auto-moderation menu, see `lib/structures/automod-menu`.
 *
 * @remarks
 *
 * What a component does is read from its custom ID, so there is no state to keep between the clicks. Only the user who
 * opened the menu can use it, and they need the administrator level every time, as the `/automod` subcommands do. Every
 * change is made on the rule the database has, the one the menu shows may be behind another change.
 */
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const { guildId } = interaction;
		const action = decodeAutoModerationMenuId(content);
		const fail = (message: string) => interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
		if (action === null || guildId === undefined) return fail(getDefaultExpiredReply());

		const t = getSupportedUserLanguageT(interaction);
		if (interaction.user.id !== action.ownerId) {
			return fail(translateKey(t, `${Root}:menuWrongUser`, { command: inlineCode('/automod list') }));
		}

		if (
			interaction.member === undefined ||
			!(await hasCommandPermissionLevel({ guildId, member: interaction.member }, CommandPermissionLevel.Administrator))
		) {
			return fail(translateKey(t, 'preconditions:administrator', { command: { name: this.name } }));
		}

		const context: AutoModerationMenuContext = { t, ownerId: action.ownerId };

		// The modals are the only things that are submitted, everything else is a click:
		if (interaction instanceof ModalSubmitInteraction) {
			if (action.verb !== 'submit') return fail(getDefaultExpiredReply());
			return this.submit(interaction as ModalInteraction, guildId, context, action);
		}

		const component = interaction as ComponentInteraction;
		const [value] = getSelectValues(component);
		switch (action.verb) {
			case 'list':
				return this.showRules(component, guildId, context);
			case 'setting':
				return this.setting(component, guildId, context, action.argument, value);
			case 'create':
				if (!isAutoModerationRuleType(value)) return fail(getDefaultExpiredReply());
				return component.showModal(renderAutoModerationCreateModal(context, value));
			case 'pick':
				return this.showRule(component, guildId, context, value ?? '', 'options');
			case 'view':
				return this.showRule(component, guildId, context, action.ruleId, action.section);
			case 'section':
				return this.showRule(component, guildId, context, action.ruleId, isAutoModerationMenuSection(value) ? value : action.section);
			case 'delete':
				return this.showRule(component, guildId, context, action.ruleId, action.section, true);
			case 'edit':
				return this.edit(component, guildId, context, action);
			case 'confirm':
				return this.delete(component, guildId, context, action);
			case 'toggle':
				return this.change(component, guildId, context, action, (rule) => ({
					update: toggleAutoModerationMenuSwitch(rule, action.argument)
				}));
			case 'clear':
				return this.change(component, guildId, context, action, (rule) => ({ update: clearAutoModerationMenuList(rule) }));
			case 'punishment':
				return this.change(component, guildId, context, action, (rule) => ({
					update:
						rule.type !== 'NoMentionSpam' && AutoModerationHardActions.includes(value as AutoModerationHardAction)
							? { hardAction: value as AutoModerationHardAction }
							: null
				}));
			case 'roles':
				return this.exempt(component, guildId, context, action, 'ignoredRoles');
			case 'channels':
				return this.exempt(component, guildId, context, action, 'ignoredChannels');
			default:
				return fail(getDefaultExpiredReply());
		}
	}

	private async showRules(
		interaction: ComponentInteraction | ModalInteraction,
		guildId: Snowflake,
		context: AutoModerationMenuContext,
		notice?: string
	) {
		const rules = await readAutoModerationRules(guildId);
		const settings = await readSettings(guildId);
		return interaction.update(renderAutoModerationRules(context, rules, { settings, notice }));
	}

	/**
	 * Changes a setting of the auto-moderation of the server, then shows the rules again.
	 *
	 * @param channelId - The channel picked in the select menu of the log channel, `undefined` when it was emptied.
	 */
	private async setting(
		interaction: ComponentInteraction,
		guildId: Snowflake,
		context: AutoModerationMenuContext,
		argument: string,
		channelId: Snowflake | undefined
	) {
		const actorId = interaction.user.id;
		switch (argument) {
			case 'module':
				await writeSettings(guildId, (settings) => ({ modulesAutomod: !settings.modulesAutomod }), actorId);
				break;
			case 'native':
				await writeSettings(guildId, (settings) => ({ automodTrackNative: !settings.automodTrackNative }), actorId);
				break;
			case 'channel':
				await writeSettings(guildId, { automodChannel: channelId ?? null }, actorId);
				break;
			default:
				return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });
		}

		return this.showRules(interaction, guildId, context);
	}

	/**
	 * Shows a section of a rule, or the rules when it is gone.
	 */
	private async showRule(
		interaction: ComponentInteraction,
		guildId: Snowflake,
		context: AutoModerationMenuContext,
		ruleId: string,
		section: AutoModerationMenuSection,
		confirmDelete = false
	) {
		const rule = await this.findRule(guildId, ruleId);
		if (rule === null) return this.showRules(interaction, guildId, context, translateKey(context.t, `${Root}:menuGone`));
		return interaction.update(renderAutoModerationRule(context, rule, section, { confirmDelete }));
	}

	/**
	 * Opens the modal of a button, filled with what the rule has.
	 */
	private async edit(interaction: ComponentInteraction, guildId: Snowflake, context: AutoModerationMenuContext, action: AutoModerationMenuAction) {
		const rule = await this.findRule(guildId, action.ruleId);
		if (rule === null) return this.showRules(interaction, guildId, context, translateKey(context.t, `${Root}:menuGone`));

		const modal = renderAutoModerationModal(context, rule, action);
		if (modal === null) return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });
		return interaction.showModal(modal);
	}

	/**
	 * Stores what was written in a modal. What is not valid is answered apart, so the menu stays as it was.
	 */
	private submit(interaction: ModalInteraction, guildId: Snowflake, context: AutoModerationMenuContext, action: AutoModerationMenuAction) {
		const { t } = context;
		const read = (key: string) => getModalValue(interaction.data.components, key);
		const value = read(AutoModerationMenuInputId) ?? '';
		if (action.argument === 'create') return this.create(interaction, guildId, context, action.ruleId, value);

		return this.change(interaction, guildId, context, action, (rule) => {
			switch (action.argument) {
				case 'name':
					return { update: { name: value } };
				case 'add':
				case 'remove': {
					const result = editAutoModerationMenuList(t, rule, parseAutoModerationMenuEntries(value), action.argument);
					const lines = [translateKey(t, `${Root}:menuListChanged`, { count: result.changed })];
					if (result.skipped > 0) lines.push(translateKey(t, `${Root}:menuListSkipped`, { count: result.skipped, reason: result.reason }));
					return { update: result.update, notice: lines.join(' ') };
				}
				case 'numbers': {
					const parsed = parseAutoModerationMenuNumbers(t, rule, read);
					if (!parsed.ok) throw new InvalidInput(parsed.error);
					return { update: parsed.value };
				}
				case 'escalation': {
					const parsed = rule.type === 'NoMentionSpam' ? null : parseAutoModerationMenuEscalation(t, read);
					if (parsed === null) return { update: null };
					if (!parsed.ok) throw new InvalidInput(parsed.error);
					return { update: parsed.value };
				}
				case 'duration':
				case 'threshold': {
					const parsed = rule.type === 'NoMentionSpam' ? null : parseAutoModerationMenuTiming(t, read);
					if (parsed === null) return { update: null };
					if (!parsed.ok) throw new InvalidInput(parsed.error);
					return { update: parsed.value };
				}
				default:
					return { update: null };
			}
		});
	}

	/**
	 * Sets the roles or the channels a rule leaves alone to what was picked, unless the list changed since the menu
	 * was rendered: the menu holds the whole list, and would undo what somebody else just did.
	 */
	private exempt(
		interaction: ComponentInteraction,
		guildId: Snowflake,
		context: AutoModerationMenuContext,
		action: AutoModerationMenuAction,
		key: 'ignoredRoles' | 'ignoredChannels'
	) {
		const values = getSelectValues(interaction);
		return this.change(interaction, guildId, context, action, (rule) => {
			const update = setAutoModerationMenuExemptions(rule, key, action.argument, values);
			return update === null ? { update: null, notice: translateKey(context.t, `${Root}:menuExemptStale`) } : { update };
		});
	}

	/**
	 * Changes a rule, then shows the section it was on again.
	 *
	 * @param getChange - Reads what changes from the rule as the database has it.
	 */
	private async change(
		interaction: ComponentInteraction | ModalInteraction,
		guildId: Snowflake,
		context: AutoModerationMenuContext,
		action: AutoModerationMenuAction,
		getChange: (rule: AutoModerationRule) => Change
	) {
		let notice: string | undefined;
		let rule: AutoModerationRule;
		try {
			rule = await updateAutoModerationRule(guildId, action.ruleId, (current) => {
				const change = getChange(current);
				notice = change.notice;
				return change.update;
			});
		} catch (error) {
			if (error instanceof InvalidInput) return interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
			if (error instanceof AutoModerationRuleError && error.code === 'unknown') {
				return this.showRules(interaction, guildId, context, translateKey(context.t, `${Root}:menuGone`));
			}

			return interaction.reply({ content: translateRuleError(context.t, error, action.ruleId), flags: MessageFlags.Ephemeral });
		}

		return interaction.update(renderAutoModerationRule(context, rule, action.section, { notice }));
	}

	/**
	 * Creates a rule of the type picked in the select menu, with the name written in the modal, and opens it.
	 */
	private async create(interaction: ModalInteraction, guildId: Snowflake, context: AutoModerationMenuContext, type: string, name: string) {
		const { t } = context;
		if (!isAutoModerationRuleType(type)) return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });

		let rule: AutoModerationRule;
		try {
			rule = await createAutoModerationRule(guildId, name, type);
		} catch (error) {
			return interaction.reply({ content: translateRuleError(t, error, name), flags: MessageFlags.Ephemeral });
		}

		return interaction.update(renderAutoModerationRule(context, rule, 'options', { notice: translateKey(t, `${Root}:menuCreated`) }));
	}

	private async delete(
		interaction: ComponentInteraction,
		guildId: Snowflake,
		context: AutoModerationMenuContext,
		action: AutoModerationMenuAction
	) {
		const { t } = context;
		const rule = await this.findRule(guildId, action.ruleId);

		let notice = translateKey(t, `${Root}:menuGone`);
		if (rule !== null) {
			try {
				await deleteAutoModerationRule(guildId, rule.id);
				notice = translateKey(t, `${Root}:deleteSuccess`, { name: rule.name });
			} catch (error) {
				// Somebody else deleted it in the meantime, the rules are shown without it either way:
				if (!(error instanceof AutoModerationRuleError)) throw error;
			}
		}

		return this.showRules(interaction, guildId, context, notice);
	}

	private async findRule(guildId: Snowflake, ruleId: string): Promise<AutoModerationRule | null> {
		const rules = await readAutoModerationRules(guildId);
		return rules.find((rule) => rule.id === ruleId) ?? null;
	}
}

/**
 * What was written in a modal is not valid, the message is what to tell the user.
 */
class InvalidInput extends Error {}

function getSelectValues(interaction: ComponentInteraction): string[] {
	const { data } = interaction;
	return 'values' in data ? [...data.values] : [];
}
