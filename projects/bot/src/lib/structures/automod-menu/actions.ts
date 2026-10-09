import { AutoModerationRoot, editRuleListEntry, resolveDurationOption } from '#lib/moderation/automod/commands';
import type { AutoModerationRuleUpdate } from '#lib/moderation/automod/rules';
import { AutoModerationOnInfraction } from '#lib/moderation/structures/AutoModerationOnInfraction';
import { translateKey, type TranslationKey } from '#lib/structures/commands/utils';
import type { TFunction } from '@wolfstar/plugin-i18next';
import {
	AutoModerationRuleLimits,
	AutoModerationRuleOptionLimits,
	AutoModerationHardActions,
	MaximumAutoModerationRuleEscalationSteps,
	MaximumAutoModerationRuleListLength,
	type AutoModerationHardAction,
	type AutoModerationRule,
	type AutoModerationRuleEscalationStep
} from 'wolfstar-database';

const Root = AutoModerationRoot;

/**
 * The custom IDs of the text inputs of the modals of the duration of a punishment and of its threshold.
 */
export const AutoModerationMenuTimingInputs = { duration: 'duration', threshold: 'threshold', period: 'period' } as const;

/**
 * The custom ID of the text input of the modals that take one value: the name of a rule, the entries of its list.
 */
export const AutoModerationMenuInputId = 'value';

export interface AutoModerationMenuNumberField {
	/** The name of the option, which is also the custom ID of its text input. */
	key: string;
	label: TranslationKey;
	value: number;
	minimum: number;
	maximum: number;
}

/**
 * The numbers of the options of a rule, which its type decides, with the limits of each.
 */
export function getAutoModerationMenuNumberFields(rule: AutoModerationRule): AutoModerationMenuNumberField[] {
	const limits = (AutoModerationRuleOptionLimits as Record<string, Record<string, { minimum: number; maximum: number }> | undefined>)[rule.type];
	if (limits === undefined) return [];

	const options = rule.options as Record<string, unknown>;
	return Object.entries(limits).map(([key, limit]) => ({
		key,
		label: `${Root}:menuOption${rule.type}${key.charAt(0).toUpperCase()}${key.slice(1)}` as TranslationKey,
		value: Number(options[key]),
		...limit
	}));
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Reads the numbers of the options of a rule from what was written in their modal.
 *
 * @param read - Reads the text of an input by its custom ID.
 * @returns The options of the rule after the change, or what is wrong with the first number that is not valid.
 */
export function parseAutoModerationMenuNumbers(
	t: TFunction,
	rule: AutoModerationRule,
	read: (key: string) => string | null
): Result<AutoModerationRuleUpdate> {
	const patch: Record<string, number> = {};
	for (const field of getAutoModerationMenuNumberFields(rule)) {
		const text = read(field.key)?.trim() ?? '';
		const number = /^\d+$/.test(text) ? Number(text) : Number.NaN;
		if (!Number.isSafeInteger(number) || number < field.minimum || number > field.maximum) {
			return { ok: false, error: translateKey(t, `${Root}:menuNumberInvalid`, { ...field, option: translateKey(t, field.label) }) };
		}

		patch[field.key] = number;
	}

	return { ok: true, value: { options: { ...rule.options, ...patch } as AutoModerationRule['options'] } };
}

/**
 * Reads how long the punishment of a rule lasts, or after how many infractions within how long it applies, from what
 * was written in their modal: only the inputs the modal has are read. An empty duration, or one of zero, makes the
 * punishment permanent, and an empty period keeps the one the rule has.
 */
export function parseAutoModerationMenuTiming(t: TFunction, read: (key: string) => string | null): Result<AutoModerationRuleUpdate> {
	const inputs = AutoModerationMenuTimingInputs;
	const update: AutoModerationRuleUpdate = {};

	const durationInput = read(inputs.duration);
	if (durationInput !== null) {
		const duration = resolveDurationOption(t, durationInput.trim(), AutoModerationRuleLimits.hardActionDuration);
		if (typeof duration === 'object' && duration !== null) return { ok: false, error: duration.error };
		update.hardActionDuration = isNullishOrZeroNumber(duration) ? null : duration;
	}

	const thresholdInput = read(inputs.threshold);
	if (thresholdInput !== null) {
		const limit = AutoModerationRuleLimits.thresholdMaximum;
		const text = thresholdInput.trim();
		const threshold = /^\d+$/.test(text) ? Number(text) : Number.NaN;
		if (!Number.isSafeInteger(threshold) || threshold < limit.minimum || threshold > limit.maximum) {
			const option = translateKey(t, `${Root}:menuTimingThreshold`);
			return { ok: false, error: translateKey(t, `${Root}:menuNumberInvalid`, { ...limit, option }) };
		}

		update.thresholdMaximum = threshold;
	}

	const period = resolveDurationOption(t, read(inputs.period)?.trim(), AutoModerationRuleLimits.thresholdDuration);
	if (typeof period === 'object' && period !== null) return { ok: false, error: period.error };
	if (period !== null) update.thresholdDuration = period;

	return { ok: true, value: update };
}

/**
 * The custom IDs of the text inputs of the modal of the escalation of a rule.
 */
export const AutoModerationMenuEscalationInputs = { steps: 'steps', period: 'period' } as const;

const EscalationActions = new Map<string, AutoModerationHardAction>([
	...AutoModerationHardActions.map((action) => [action.toLowerCase(), action] as const),
	['warn', 'Warning']
]);

/**
 * Writes the steps of an escalation the way their modal reads them back, one per line (`Timeout 1h`).
 */
export function formatAutoModerationMenuEscalation(steps: readonly AutoModerationRuleEscalationStep[]): string {
	return steps.map((step) => `${step.action} ${formatAutoModerationMenuDuration(step.duration)}`.trim()).join('\n');
}

/**
 * Reads the escalation of a rule from what was written in its modal: a step per line, the name of a hard action then
 * how long it lasts when it is temporary (`timeout 1h`, `kick`, `ban 7d`), and how long a punishment is remembered.
 * No step turns the escalation off.
 */
export function parseAutoModerationMenuEscalation(t: TFunction, read: (key: string) => string | null): Result<AutoModerationRuleUpdate> {
	const inputs = AutoModerationMenuEscalationInputs;
	const lines = (read(inputs.steps) ?? '')
		.split(/[\n;]/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	if (lines.length > MaximumAutoModerationRuleEscalationSteps) {
		return { ok: false, error: translateKey(t, `${Root}:menuEscalationTooMany`, { maximum: MaximumAutoModerationRuleEscalationSteps }) };
	}

	const escalation: AutoModerationRuleEscalationStep[] = [];
	for (const line of lines) {
		const [name, ...rest] = line.split(/\s+/);
		const action = EscalationActions.get(name.toLowerCase());
		if (action === undefined) {
			return { ok: false, error: translateKey(t, `${Root}:menuEscalationInvalid`, { line, actions: AutoModerationHardActions.join(', ') }) };
		}

		const duration = resolveDurationOption(t, rest.join(' '), AutoModerationRuleLimits.hardActionDuration);
		if (typeof duration === 'object' && duration !== null) return { ok: false, error: duration.error };
		// A timeout cannot be permanent, Discord takes none without an end:
		if (action === 'Timeout' && isNullishOrZeroNumber(duration)) {
			return { ok: false, error: translateKey(t, `${Root}:menuDurationTimeout`) };
		}

		escalation.push({ action, duration: isNullishOrZeroNumber(duration) ? null : duration });
	}

	const period = resolveDurationOption(t, read(inputs.period)?.trim(), AutoModerationRuleLimits.escalationDuration);
	if (typeof period === 'object' && period !== null) return { ok: false, error: period.error };
	// The steps need a period, the rule keeps the one it has when they are removed:
	if (period === null && escalation.length > 0) return { ok: false, error: translateKey(t, `${Root}:menuEscalationPeriodRequired`) };

	return { ok: true, value: { escalation, ...(period === null ? {} : { escalationDuration: period }) } };
}

function isNullishOrZeroNumber(value: number | null): value is null | 0 {
	return value === null || value === 0;
}

/**
 * Writes a duration the way the modals read it back (`1d 2h 3m 4s`), empty for none.
 *
 * @param duration - The duration, in milliseconds.
 */
export function formatAutoModerationMenuDuration(duration: number | null): string {
	if (duration === null || duration < 1000) return '';

	const parts: string[] = [];
	let seconds = Math.floor(duration / 1000);
	for (const [unit, size] of [
		['d', 86_400],
		['h', 3600],
		['m', 60],
		['s', 1]
	] as const) {
		const amount = Math.floor(seconds / size);
		if (amount > 0) parts.push(`${amount}${unit}`);
		seconds -= amount * size;
	}

	return parts.join(' ');
}

/**
 * The entries written in the modal of a list, which commas and new lines separate.
 */
export function parseAutoModerationMenuEntries(input: string): string[] {
	const entries = input
		.split(/[,\n]/)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	return [...new Set(entries)].slice(0, MaximumAutoModerationRuleListLength);
}

export interface AutoModerationMenuListResult {
	/** What changes in the rule, `null` when no entry changed its list. */
	update: AutoModerationRuleUpdate | null;
	changed: number;
	skipped: number;
	/** Why the first entry that was skipped was. */
	reason: string | null;
}

/**
 * Adds entries to the list of a rule, or removes them, one by one as `/automod add` and `/automod remove` do: an entry
 * that cannot be added (it is there already, the list is full, it is not a valid word) is skipped.
 */
export function editAutoModerationMenuList(
	t: TFunction,
	rule: AutoModerationRule,
	entries: readonly string[],
	action: 'add' | 'remove'
): AutoModerationMenuListResult {
	let current = rule;
	let changed = 0;
	let skipped = 0;
	let reason: string | null = null;
	for (const entry of entries) {
		const result = editRuleListEntry(t, current, entry, action);
		if (result.list === null) {
			skipped++;
			reason ??= result.content;
			continue;
		}

		changed++;
		current = { ...current, options: { ...current.options, [result.key]: result.list } as AutoModerationRule['options'] };
	}

	return { update: changed === 0 ? null : { options: current.options }, changed, skipped, reason };
}

/**
 * The options of a rule with its lists emptied.
 */
export function clearAutoModerationMenuList(rule: AutoModerationRule): AutoModerationRuleUpdate {
	const options = Object.fromEntries(Object.entries(rule.options).map(([key, value]) => [key, Array.isArray(value) ? [] : value]));
	return { options: options as AutoModerationRule['options'] };
}

/**
 * The soft actions the `toggle` verb flips, by its argument.
 */
export const AutoModerationMenuSoftActions = {
	delete: AutoModerationOnInfraction.flags.Delete,
	alert: AutoModerationOnInfraction.flags.Alert,
	log: AutoModerationOnInfraction.flags.Log
} as const;

/**
 * What flipping a switch of a rule changes.
 *
 * @param argument - The switch: `enabled`, a soft action, or the `alerts` of a mention spam rule.
 * @returns `null` when the rule has no such switch.
 */
export function toggleAutoModerationMenuSwitch(rule: AutoModerationRule, argument: string): AutoModerationRuleUpdate | null {
	if (argument === 'enabled') return { enabled: !rule.enabled };
	if (argument in AutoModerationMenuSoftActions) {
		return { softAction: rule.softAction ^ AutoModerationMenuSoftActions[argument as keyof typeof AutoModerationMenuSoftActions] };
	}

	if (argument === 'alerts' && rule.type === 'NoMentionSpam') {
		const { options } = rule as AutoModerationRule<'NoMentionSpam'>;
		return { options: { ...options, alerts: !options.alerts } };
	}

	return null;
}
