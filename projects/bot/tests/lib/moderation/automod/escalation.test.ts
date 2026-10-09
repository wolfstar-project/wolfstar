import { parseAutoModerationRulePatch } from '#lib/moderation/automod/validation';
import {
	formatAutoModerationMenuEscalation,
	parseAutoModerationMenuEscalation,
	renderAutoModerationModal,
	renderAutoModerationRule
} from '#lib/structures/automod-menu';
import {
	MaximumAutoModerationRuleEscalationSteps,
	getDefaultAutoModerationRule,
	normalizeAutoModerationRuleEscalation,
	resolveAutoModerationRulePunishment,
	type AutoModerationRule,
	type AutoModerationRuleEscalationStep
} from 'wolfstar-database';

// Echoes the key, the translations are not what is tested here:
const t = ((key: string) => key) as never;

function read(values: Record<string, string>) {
	return (key: string) => values[key] ?? null;
}

function createRule(overrides: Partial<AutoModerationRule> = {}) {
	return { ...getDefaultAutoModerationRule('Links'), id: '42', guildId: '254360814063058944', name: 'Links', ...overrides } as AutoModerationRule;
}

const steps: AutoModerationRuleEscalationStep[] = [
	{ action: 'Timeout', duration: 3_600_000 },
	{ action: 'Kick', duration: null },
	{ action: 'Ban', duration: null }
];

describe('auto-moderation escalation', () => {
	describe('resolveAutoModerationRulePunishment', () => {
		const rule = { hardAction: 'Warning', hardActionDuration: null, escalation: steps } as const;

		test('GIVEN a member the rule took no hard action on lately THEN they get the one of the rule', () => {
			expect(resolveAutoModerationRulePunishment(rule, 0)).toEqual({ action: 'Warning', duration: null });
		});

		test('GIVEN a member who keeps reaching the threshold THEN they move up the steps', () => {
			expect(resolveAutoModerationRulePunishment(rule, 1)).toEqual(steps[0]);
			expect(resolveAutoModerationRulePunishment(rule, 2)).toEqual(steps[1]);
			expect(resolveAutoModerationRulePunishment(rule, 3)).toEqual(steps[2]);
		});

		test('GIVEN more hard actions than steps THEN the last step is repeated', () => {
			expect(resolveAutoModerationRulePunishment(rule, 50)).toEqual(steps[2]);
		});

		test('GIVEN a rule without an escalation THEN its hard action never changes', () => {
			expect(resolveAutoModerationRulePunishment({ ...rule, escalation: [] }, 5)).toEqual({ action: 'Warning', duration: null });
		});
	});

	describe('normalizeAutoModerationRuleEscalation', () => {
		test('GIVEN steps THEN the ones that are not are dropped, and a duration that is not one makes the step permanent', () => {
			expect(
				normalizeAutoModerationRuleEscalation([
					{ action: 'Timeout', duration: 60_000.9 },
					{ action: 'Explode' },
					null,
					{ action: 'Ban', duration: -5 }
				])
			).toEqual([
				{ action: 'Timeout', duration: 60_000 },
				{ action: 'Ban', duration: null }
			]);
		});

		test('GIVEN something that is not a list, or too many steps THEN it is emptied, or cut', () => {
			expect(normalizeAutoModerationRuleEscalation({ action: 'Ban' })).toEqual([]);
			expect(normalizeAutoModerationRuleEscalation(Array.from({ length: 30 }, () => ({ action: 'Kick' })))).toHaveLength(
				MaximumAutoModerationRuleEscalationSteps
			);
		});
	});

	describe('parseAutoModerationMenuEscalation', () => {
		test('GIVEN a step per line THEN each is a hard action and how long it lasts', () => {
			const parsed = parseAutoModerationMenuEscalation(t, read({ steps: 'timeout 1h\n\n Kick \nBAN', period: '3d' }));

			expect(parsed).toEqual({ ok: true, value: { escalation: steps, escalationDuration: 259_200_000 } });
		});

		test('GIVEN no step THEN the escalation is turned off, and the period is kept', () => {
			expect(parseAutoModerationMenuEscalation(t, read({ steps: '', period: '' }))).toEqual({ ok: true, value: { escalation: [] } });
		});

		test('GIVEN what was formatted THEN it is read back the same', () => {
			const written = formatAutoModerationMenuEscalation(steps);

			expect(written).toBe('Timeout 1h\nKick\nBan');
			expect(parseAutoModerationMenuEscalation(t, read({ steps: written, period: '1d' }))).toMatchObject({ value: { escalation: steps } });
		});

		test('GIVEN what is not a step THEN it is refused', () => {
			expect(parseAutoModerationMenuEscalation(t, read({ steps: 'explode 1h', period: '1d' })).ok).toBe(false);
			expect(parseAutoModerationMenuEscalation(t, read({ steps: 'ban soon', period: '1d' })).ok).toBe(false);
			// A timeout cannot be permanent, and the steps need a period:
			expect(parseAutoModerationMenuEscalation(t, read({ steps: 'timeout', period: '1d' })).ok).toBe(false);
			expect(parseAutoModerationMenuEscalation(t, read({ steps: 'kick', period: '' })).ok).toBe(false);
			expect(parseAutoModerationMenuEscalation(t, read({ steps: 'kick\n'.repeat(11), period: '1d' })).ok).toBe(false);
		});
	});

	describe('menu', () => {
		const context = { t, ownerId: '266624760782258186' };
		const action = { ownerId: context.ownerId, verb: 'edit', ruleId: '42', section: 'response', argument: 'escalation' } as const;

		test('GIVEN a rule with every step THEN its response section fits a message', () => {
			const escalation = Array.from({ length: MaximumAutoModerationRuleEscalationSteps }, () => steps[0]);
			const message = renderAutoModerationRule(context, createRule({ escalation }), 'response');
			const flatten = (components: readonly unknown[]): Record<string, unknown>[] =>
				components.flatMap((component) => {
					const entry = component as { components?: unknown[]; accessory?: unknown };
					return [
						entry as Record<string, unknown>,
						...flatten([...(entry.components ?? []), ...(entry.accessory ? [entry.accessory] : [])])
					];
				});
			const components = flatten(message.components!);

			expect(components.length).toBeLessThanOrEqual(40);
			expect(components.some((entry) => typeof entry.content === 'string' && entry.content.includes('`11+.`'))).toBe(true);
		});

		test('GIVEN the modal of the escalation THEN it is filled with the steps of the rule', () => {
			const modal = renderAutoModerationModal(context, createRule({ escalation: steps }), action)!;

			expect(JSON.stringify(modal)).toContain('Timeout 1h\\nKick\\nBan');
			expect(renderAutoModerationModal(context, { ...createRule(), type: 'NoMentionSpam' } as AutoModerationRule, action)).toBeNull();
		});
	});

	describe('parseAutoModerationRulePatch', () => {
		test('GIVEN an escalation THEN it is read, and one with a wrong step is refused', () => {
			expect(parseAutoModerationRulePatch('Links', { escalation: steps, escalationDuration: 3_600_000 }).data).toEqual({
				escalation: steps,
				escalationDuration: 3_600_000
			});
			expect(parseAutoModerationRulePatch('Links', { escalation: [{ action: 'Explode' }] }).errors).toHaveLength(1);
			// A duration that is not one is refused, not made permanent, and a timeout needs one:
			expect(parseAutoModerationRulePatch('Links', { escalation: [{ action: 'Ban', duration: '1h' }] }).errors).toHaveLength(1);
			expect(parseAutoModerationRulePatch('Links', { escalation: [{ action: 'Ban', duration: -5 }] }).errors).toHaveLength(1);
			expect(parseAutoModerationRulePatch('Links', { escalation: [{ action: 'Timeout' }] }).errors).toHaveLength(1);
			expect(parseAutoModerationRulePatch('Links', { escalation: [{ action: 'Timeout', duration: 0 }] }).errors).toHaveLength(1);
			expect(parseAutoModerationRulePatch('Links', { escalation: [{ action: 'Kick' }] }).data).toEqual({
				escalation: [{ action: 'Kick', duration: null }]
			});
			expect(parseAutoModerationRulePatch('Links', { escalationDuration: 5 }).errors).toHaveLength(1);
		});
	});
});
