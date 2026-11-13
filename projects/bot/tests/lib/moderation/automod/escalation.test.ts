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
	{ action: 'Mute', duration: 3_600_000 },
	{ action: 'Kick', duration: null },
	{ action: 'Ban', duration: null }
];

describe('auto-moderation escalation', () => {
	describe('no hard action', () => {
		test('GIVEN a rule with no hard action THEN the patch keeps it', () => {
			expect(parseAutoModerationRulePatch('Links', { hardAction: 'None' })).toMatchObject({ data: { hardAction: 'None' } });
		});

		test('GIVEN no hard action as a step THEN it is not a step of an escalation', () => {
			expect(normalizeAutoModerationRuleEscalation([{ action: 'None', duration: null }])).toEqual([]);
			expect(parseAutoModerationRulePatch('Links', { escalation: [{ action: 'None' }] })).toMatchObject({
				errors: [expect.stringContaining('escalation')]
			});
			expect(parseAutoModerationMenuEscalation(t, read({ steps: 'none', period: '1d' })).ok).toBe(false);

			const { errors } = parseAutoModerationRulePatch('Links', { escalation: [{ action: 'None' }] }) as { errors: string[] };
			expect(errors[0]).not.toContain('None');
		});

		test('GIVEN a rule with no hard action THEN the menu selects it', () => {
			const context = { t, ownerId: '1' };
			const options = JSON.stringify(renderAutoModerationRule(context, createRule({ hardAction: 'None' }), 'response'));
			expect(options).toContain('"value":"None","default":true');
		});
	});

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

		test('GIVEN a rule whose hard action is None THEN the steps it kept are not taken', () => {
			const none = { ...rule, hardAction: 'None' } as const;
			expect(resolveAutoModerationRulePunishment(none, 0)).toEqual({ action: 'None', duration: null });
			expect(resolveAutoModerationRulePunishment(none, 3)).toEqual({ action: 'None', duration: null });
		});
	});

	describe('normalizeAutoModerationRuleEscalation', () => {
		test('GIVEN steps THEN the ones that are not are dropped, and a duration that is not one makes the step permanent', () => {
			expect(
				normalizeAutoModerationRuleEscalation([
					{ action: 'Mute', duration: 60_000.9 },
					{ action: 'Explode' },
					null,
					{ action: 'Ban', duration: -5 }
				])
			).toEqual([
				{ action: 'Mute', duration: 60_000 },
				{ action: 'Ban', duration: null }
			]);
		});

		// The steps saved before the Timeout was merged into the Mute still have it:
		test('GIVEN a step that is a Timeout THEN it is a Mute', () => {
			expect(normalizeAutoModerationRuleEscalation([{ action: 'Timeout', duration: 60_000 }])).toEqual([{ action: 'Mute', duration: 60_000 }]);
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
			const parsed = parseAutoModerationMenuEscalation(t, read({ steps: 'mute 1h\n\n Kick \nBAN', period: '3d' }));

			expect(parsed).toEqual({ ok: true, value: { escalation: steps, escalationDuration: 259_200_000 } });
		});

		test('GIVEN a step written as a timeout THEN it is a Mute, permanent or not', () => {
			expect(parseAutoModerationMenuEscalation(t, read({ steps: 'timeout 1h\ntimeout', period: '1d' }))).toMatchObject({
				value: {
					escalation: [
						{ action: 'Mute', duration: 3_600_000 },
						{ action: 'Mute', duration: null }
					]
				}
			});
		});

		test('GIVEN no step THEN the escalation is turned off, and the period is kept', () => {
			expect(parseAutoModerationMenuEscalation(t, read({ steps: '', period: '' }))).toEqual({ ok: true, value: { escalation: [] } });
		});

		test('GIVEN what was formatted THEN it is read back the same', () => {
			const written = formatAutoModerationMenuEscalation(steps);

			expect(written).toBe('Mute 1h\nKick\nBan');
			expect(parseAutoModerationMenuEscalation(t, read({ steps: written, period: '1d' }))).toMatchObject({ value: { escalation: steps } });
		});

		test('GIVEN what is not a step THEN it is refused', () => {
			expect(parseAutoModerationMenuEscalation(t, read({ steps: 'explode 1h', period: '1d' })).ok).toBe(false);
			expect(parseAutoModerationMenuEscalation(t, read({ steps: 'ban soon', period: '1d' })).ok).toBe(false);
			// The steps need a period:
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

			expect(JSON.stringify(modal)).toContain('Mute 1h\\nKick\\nBan');
		});
	});

	describe('parseAutoModerationRulePatch', () => {
		test('GIVEN an escalation THEN it is read, and one with a wrong step is refused', () => {
			expect(parseAutoModerationRulePatch('Links', { escalation: steps, escalationDuration: 3_600_000 }).data).toEqual({
				escalation: steps,
				escalationDuration: 3_600_000
			});
			expect(parseAutoModerationRulePatch('Links', { escalation: [{ action: 'Explode' }] }).errors).toHaveLength(1);
			// A duration that is not one is refused, not made permanent:
			expect(parseAutoModerationRulePatch('Links', { escalation: [{ action: 'Ban', duration: '1h' }] }).errors).toHaveLength(1);
			expect(parseAutoModerationRulePatch('Links', { escalation: [{ action: 'Ban', duration: -5 }] }).errors).toHaveLength(1);
			expect(parseAutoModerationRulePatch('Links', { escalation: [{ action: 'Mute', duration: 0 }] }).errors).toHaveLength(1);
			// A client written before the Timeout was merged into the Mute may still send one:
			expect(parseAutoModerationRulePatch('Links', { escalation: [{ action: 'Timeout', duration: 60_000 }] }).data).toEqual({
				escalation: [{ action: 'Mute', duration: 60_000 }]
			});
			expect(parseAutoModerationRulePatch('Links', { escalation: [{ action: 'Kick' }] }).data).toEqual({
				escalation: [{ action: 'Kick', duration: null }]
			});
			expect(parseAutoModerationRulePatch('Links', { escalationDuration: 5 }).errors).toHaveLength(1);
		});
	});
});
