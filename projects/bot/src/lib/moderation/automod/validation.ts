import { isObject } from '@sapphire/utilities';
import { remove as removeConfusables } from 'confusables';
import {
	AutoModerationHardActions,
	AutoModerationRuleLimits,
	AutoModerationRuleOptionLimits,
	AutoModerationRuleWordLength,
	getDefaultAutoModerationRuleOptions,
	isAutoModerationRuleWord,
	MaximumAutoModerationRuleEscalationSteps,
	MaximumAutoModerationRuleListLength,
	MaximumAutoModerationRuleNameLength,
	normalizeAutoModerationRuleEscalation,
	normalizeAutoModerationRuleOptions,
	type AutoModerationHardAction,
	type AutoModerationRuleData,
	type AutoModerationRuleType
} from 'wolfstar-database';

/**
 * The most roles or channels a rule leaves alone.
 */
export const MaximumAutoModerationRuleIgnored = 100;

/**
 * A word as a `Words` rule stores it: lowercase and without look-alike characters, as the messages are matched.
 */
export function normalizeAutoModerationRuleWord(word: string) {
	return removeConfusables(word.trim().toLowerCase());
}

/**
 * The bits a soft action is made of, see `AutoModerationOnInfraction`.
 */
const MaximumSoftAction = 0b111;

export type AutoModerationRulePatch = Partial<Omit<AutoModerationRuleData, 'type'>>;

/**
 * Reads what a rule is created or edited with from data that is not trusted, the body of a request.
 *
 * @remarks Only the fields that are given are read, so the result is a patch. The options are read with
 * `normalizeAutoModerationRuleOptions`, on top of `currentOptions`, so a request can give only the ones that change.
 *
 * @param type - The type of the rule, which its options depend on.
 * @param input - The data to read.
 * @param currentOptions - The options the rule has, when it exists.
 * @returns The patch, or what is wrong with the data, one message per field.
 */
export function parseAutoModerationRulePatch(
	type: AutoModerationRuleType,
	input: unknown,
	currentOptions: object = {}
): { data: AutoModerationRulePatch; errors?: undefined } | { data?: undefined; errors: string[] } {
	if (!isObject(input)) return { errors: ['Invalid body.'] };

	const body = input as Record<string, unknown>;
	const data: AutoModerationRulePatch = {};
	const errors: string[] = [];

	if (body.name !== undefined) {
		if (typeof body.name === 'string' && body.name.trim().length > 0 && body.name.trim().length <= MaximumAutoModerationRuleNameLength) {
			data.name = body.name;
		} else {
			errors.push(`name: Expected a string of 1 to ${MaximumAutoModerationRuleNameLength} characters.`);
		}
	}

	if (body.enabled !== undefined) {
		if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
		else errors.push('enabled: Expected a boolean.');
	}

	if (body.softAction !== undefined) {
		if (isInteger(body.softAction, 0, MaximumSoftAction)) data.softAction = body.softAction;
		else errors.push(`softAction: Expected an integer between 0 and ${MaximumSoftAction}.`);
	}

	if (body.hardAction !== undefined) {
		if (AutoModerationHardActions.includes(body.hardAction as AutoModerationHardAction)) {
			data.hardAction = body.hardAction as AutoModerationHardAction;
		} else {
			errors.push(`hardAction: Expected one of ${AutoModerationHardActions.join(', ')}.`);
		}
	}

	if (body.hardActionDuration !== undefined) {
		const { minimum, maximum } = AutoModerationRuleLimits.hardActionDuration;
		// Zero and `null` both make the hard action permanent:
		if (body.hardActionDuration === null || body.hardActionDuration === 0) data.hardActionDuration = null;
		else if (isInteger(body.hardActionDuration, minimum, maximum)) data.hardActionDuration = body.hardActionDuration;
		else errors.push(`hardActionDuration: Expected null or an integer between ${minimum} and ${maximum}.`);
	}

	for (const key of ['thresholdMaximum', 'thresholdDuration'] as const) {
		const value = body[key];
		if (value === undefined) continue;

		const { minimum, maximum } = AutoModerationRuleLimits[key];
		if (isInteger(value, minimum, maximum)) data[key] = value;
		else errors.push(`${key}: Expected an integer between ${minimum} and ${maximum}.`);
	}

	for (const key of ['ignoredRoles', 'ignoredChannels'] as const) {
		const value = body[key];
		if (value === undefined) continue;

		if (Array.isArray(value) && value.length <= MaximumAutoModerationRuleIgnored && value.every(isSnowflake)) data[key] = [...new Set(value)];
		else errors.push(`${key}: Expected an array of at most ${MaximumAutoModerationRuleIgnored} IDs.`);
	}

	if (body.escalation !== undefined) {
		// The steps are checked before they are normalized, which would make a wrong duration a permanent punishment:
		if (
			Array.isArray(body.escalation) &&
			body.escalation.length <= MaximumAutoModerationRuleEscalationSteps &&
			body.escalation.every((step) => isEscalationStep(step))
		) {
			data.escalation = normalizeAutoModerationRuleEscalation(body.escalation);
		} else {
			const { maximum } = AutoModerationRuleLimits.hardActionDuration;
			errors.push(
				`escalation: Expected an array of at most ${MaximumAutoModerationRuleEscalationSteps} steps, each an action (${AutoModerationHardActions.join(', ')}) and a duration: null, or an integer between 1 and ${maximum}, which a Timeout requires.`
			);
		}
	}

	if (body.escalationDuration !== undefined) {
		const { minimum, maximum } = AutoModerationRuleLimits.escalationDuration;
		if (isInteger(body.escalationDuration, minimum, maximum)) data.escalationDuration = body.escalationDuration;
		else errors.push(`escalationDuration: Expected an integer between ${minimum} and ${maximum}.`);
	}

	if (body.options !== undefined) {
		if (isObject(body.options)) {
			const options = { ...currentOptions, ...body.options } as Record<string, unknown>;
			if (type === 'Words' && Array.isArray(options.words)) {
				options.words = options.words.map((word) => (typeof word === 'string' ? normalizeAutoModerationRuleWord(word) : word));
			}
			const normalized = normalizeAutoModerationRuleOptions(type, options);
			// A list longer than the cap that the rule already had is kept, but it cannot grow:
			const current = currentOptions as Record<string, unknown>;
			for (const [key, value] of Object.entries(normalized)) {
				if (!Array.isArray(value) || value.length <= MaximumAutoModerationRuleListLength) continue;
				const previous = Array.isArray(current[key]) ? current[key].length : 0;
				if (value.length > previous) {
					errors.push(`options.${key}: Expected at most ${MaximumAutoModerationRuleListLength} entries.`);
				}
			}

			data.options = normalized;
		} else {
			errors.push('options: Expected an object.');
		}
	}

	return errors.length === 0 ? { data } : { errors };
}

/**
 * Checks the options of a rule as they were written, before they are normalized.
 *
 * @remarks `normalizeAutoModerationRuleOptions` repairs what it reads: a value of the wrong type takes its default, a
 * number is brought within its limits and an entry of a list that is not valid is dropped. That is right for what the
 * database stores, and wrong for a file that has to be taken whole or refused: a list written as a text would empty the
 * list of the rule. What only differs in how it is written (the case, the spaces around, a duplicate) is not a problem.
 *
 * @param type - The type of the rule, which its options depend on.
 * @param options - The options to check.
 * @returns What is wrong, one message per value, each starting with where it is (`options.words[2]: …`).
 */
export function checkAutoModerationRuleOptions(type: AutoModerationRuleType, options: Record<string, unknown>): string[] {
	const defaults = getDefaultAutoModerationRuleOptions(type) as Record<string, unknown>;
	const limits = (AutoModerationRuleOptionLimits as Record<string, Record<string, { minimum: number; maximum: number }> | undefined>)[type];
	const errors: string[] = [];

	for (const [key, value] of Object.entries(options)) {
		const path = `options.${key}`;
		if (!Object.hasOwn(defaults, key)) {
			errors.push(`${path}: Not an option of a rule of type ${type}.`);
			continue;
		}

		const fallback = defaults[key];
		if (typeof fallback === 'number') {
			const { minimum, maximum } = limits?.[key] ?? { minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER };
			if (!isInteger(value, minimum, maximum)) errors.push(`${path}: Expected an integer between ${minimum} and ${maximum}.`);
		} else if (typeof fallback === 'boolean') {
			if (typeof value !== 'boolean') errors.push(`${path}: Expected a boolean.`);
		} else if (Array.isArray(value)) {
			for (const [index, entry] of value.entries()) {
				const error = checkListEntry(type, entry);
				if (error !== null) errors.push(`${path}[${index}]: ${error}`);
			}
		} else {
			errors.push(`${path}: Expected an array of strings.`);
		}
	}

	return errors;
}

/**
 * @returns Why a value cannot be an entry of a list of the options of a rule, `null` when it can.
 */
function checkListEntry(type: AutoModerationRuleType, entry: unknown): string | null {
	if (typeof entry !== 'string' || entry.trim().length === 0) return 'Expected a string that is not empty.';
	if (type !== 'Words' || isAutoModerationRuleWord(normalizeAutoModerationRuleWord(entry))) return null;

	const { minimum, maximum } = AutoModerationRuleWordLength;
	return `Expected a word of ${minimum} to ${maximum} characters.`;
}

/**
 * Whether a value is a step of an escalation as a request must write it: a hard action, and a duration that is `null`
 * (or left out) for a permanent one or a positive integer within the limits. A timeout cannot be permanent.
 */
function isEscalationStep(value: unknown): boolean {
	if (!isObject(value)) return false;

	const { action, duration } = value as { action?: unknown; duration?: unknown };
	if (!AutoModerationHardActions.includes(action as AutoModerationHardAction)) return false;
	if (duration === null || duration === undefined) return action !== 'Timeout';
	return isInteger(duration, 1, AutoModerationRuleLimits.hardActionDuration.maximum);
}

function isInteger(value: unknown, minimum: number, maximum: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function isSnowflake(value: unknown): value is string {
	return typeof value === 'string' && /^\d{17,20}$/.test(value);
}
