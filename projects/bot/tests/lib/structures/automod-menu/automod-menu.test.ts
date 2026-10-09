import {
	AutoModerationMenuSections,
	clearAutoModerationMenuList,
	decodeAutoModerationMenuId,
	editAutoModerationMenuList,
	encodeAutoModerationMenuId,
	formatAutoModerationMenuDuration,
	getAutoModerationMenuNumberFields,
	getAutoModerationMenuRevision,
	parseAutoModerationMenuEntries,
	parseAutoModerationMenuNumbers,
	parseAutoModerationMenuTiming,
	renderAutoModerationCreateModal,
	renderAutoModerationModal,
	renderAutoModerationRule,
	renderAutoModerationRules,
	setAutoModerationMenuExemptions,
	toggleAutoModerationMenuSwitch,
	type AutoModerationMenuAction,
	type AutoModerationMenuContext
} from '#lib/structures/automod-menu';
import { MessageFlags } from 'discord-api-types/v10';
import { AutoModerationRuleTypes, getDefaultAutoModerationRule, type AutoModerationRule, type AutoModerationRuleType } from 'wolfstar-database';

const ownerId = '266624760782258186';

// Echoes the key, the translations are not what is tested here:
const t = ((key: string) => key) as never;
const context: AutoModerationMenuContext = { t, ownerId };

function createRule<Type extends AutoModerationRuleType>(type: Type, overrides: Partial<AutoModerationRule<Type>> = {}) {
	return {
		...getDefaultAutoModerationRule(type),
		id: '42',
		guildId: '254360814063058944',
		name: `${type} rule`,
		...overrides
	} as AutoModerationRule;
}

/** Splits a custom ID the way the framework does before it calls the handler. */
function decode(customId: string) {
	const [, ...content] = customId.split('.');
	return decodeAutoModerationMenuId(content);
}

/** Every component of a message, the nested ones included. */
function flatten(components: readonly unknown[]): Record<string, unknown>[] {
	return components.flatMap((component) => {
		const entry = component as { components?: unknown[]; accessory?: unknown };
		return [entry as Record<string, unknown>, ...flatten([...(entry.components ?? []), ...(entry.accessory ? [entry.accessory] : [])])];
	});
}

function read(values: Record<string, string>) {
	return (key: string) => values[key] ?? null;
}

describe('auto-moderation menu', () => {
	describe('custom IDs', () => {
		test('GIVEN an action THEN it is read back as it was written', () => {
			const action: AutoModerationMenuAction = { ownerId, verb: 'toggle', ruleId: '42', section: 'response', argument: 'delete' };
			const id = encodeAutoModerationMenuId(action);

			expect(id.length).toBeLessThanOrEqual(100);
			expect(decode(id)).toEqual(action);
		});

		test('GIVEN only an owner and a verb THEN the rest is empty', () => {
			expect(decode(encodeAutoModerationMenuId({ ownerId, verb: 'list' }))).toEqual({
				ownerId,
				verb: 'list',
				ruleId: '',
				section: 'options',
				argument: ''
			});
		});

		test('GIVEN a custom ID that is not of the menu THEN it is not read', () => {
			expect(decodeAutoModerationMenuId([ownerId, 'explode:42:options:'])).toBeNull();
			expect(decodeAutoModerationMenuId([ownerId, 'view:42:nowhere:'])).toBeNull();
			expect(decodeAutoModerationMenuId([ownerId, 'view:42'])).toBeNull();
		});
	});

	describe('rendering', () => {
		const ids = Array.from({ length: 100 }, (_, index) => `25436081406305${String(1000 + index).padStart(4, '0')}`);

		test.each(AutoModerationRuleTypes.flatMap((type) => AutoModerationMenuSections.map((section) => [type, section] as const)))(
			'GIVEN a %s rule THEN its %s section fits a message',
			(type, section) => {
				const rule = createRule(type, { ignoredRoles: ids, ignoredChannels: ids.slice(0, 25) });
				for (const confirmDelete of [false, true]) {
					const message = renderAutoModerationRule(context, rule, section, { notice: 'Notice', confirmDelete });
					const components = flatten(message.components!);
					const customIds = components.map((component) => component.custom_id).filter((id) => id !== undefined);
					const length = components.reduce(
						(total, component) => total + (typeof component.content === 'string' ? component.content.length : 0),
						0
					);

					expect(message.flags).toBe(MessageFlags.IsComponentsV2);
					expect(components.length).toBeLessThanOrEqual(40);
					expect(length).toBeLessThanOrEqual(4000);
					expect(new Set(customIds).size).toBe(customIds.length);
					for (const id of customIds) expect(String(id).length).toBeLessThanOrEqual(100);
				}
			}
		);

		test('GIVEN a full list of words THEN it is cut to fit a message', () => {
			const words = Array.from({ length: 200 }, (_, index) => `${'word'.repeat(7)}${index}`);
			const message = renderAutoModerationRule(context, createRule('Words', { options: { words } }), 'options');
			const length = flatten(message.components!).reduce(
				(total, entry) => total + (typeof entry.content === 'string' ? entry.content.length : 0),
				0
			);

			expect(length).toBeLessThanOrEqual(4000);
		});

		test('GIVEN more exemptions than a select menu holds THEN the select menu is left out', () => {
			const many = flatten(renderAutoModerationRule(context, createRule('Links', { ignoredRoles: ids }), 'exempt').components!);
			const few = flatten(renderAutoModerationRule(context, createRule('Links', { ignoredRoles: ids.slice(0, 3) }), 'exempt').components!);
			const hasRoles = (components: Record<string, unknown>[]) => components.some((entry) => decode(String(entry.custom_id))?.verb === 'roles');

			expect(hasRoles(many)).toBe(false);
			expect(hasRoles(few)).toBe(true);
		});

		test('GIVEN the rules of a server THEN each is an option of the select menu', () => {
			const rules = [createRule('Links', { id: '1' }), createRule('Words', { id: '2', enabled: false })];
			const settings = { modulesAutomod: true, automodChannel: '254360814063058945', automodTrackNative: false };
			const selects = (list: AutoModerationRule[]) =>
				flatten(renderAutoModerationRules(context, list, { settings }).components!).filter((entry) => Array.isArray(entry.options));
			const verbs = (list: AutoModerationRule[]) => selects(list).map((entry) => decode(String(entry.custom_id))?.verb);

			expect((selects(rules)[0].options as { value: string }[]).map((option) => option.value)).toEqual(['1', '2']);
			expect(verbs(rules)).toEqual(['pick', 'create']);
			// Without rules only the select menu that creates one is left, and a server that has them all loses it:
			expect(verbs([])).toEqual(['create']);
			expect(verbs(Array.from({ length: 25 }, (_, index) => createRule('Links', { id: String(index) })))).toEqual(['pick']);
		});

		test('GIVEN the settings of the auto-moderation THEN they are shown with the rules, and fit a message', () => {
			const rules = Array.from({ length: 25 }, (_, index) => createRule('Links', { id: String(index + 1), name: 'n'.repeat(50) }));
			const settings = { modulesAutomod: true, automodChannel: '254360814063058945', automodTrackNative: false };
			const components = flatten(renderAutoModerationRules(context, rules, { settings, notice: 'Notice' }).components!);
			const arguments_ = components.map((entry) => decode(String(entry.custom_id))).filter((action) => action?.verb === 'setting');
			const channel = components.find((entry) => decode(String(entry.custom_id))?.argument === 'channel');

			expect(arguments_.map((action) => action!.argument)).toEqual(['module', 'native', 'channel']);
			expect(channel!.default_values).toEqual([{ id: settings.automodChannel, type: 'channel' }]);
			expect(components.length).toBeLessThanOrEqual(40);
			expect(
				components.reduce((total, entry) => total + (typeof entry.content === 'string' ? entry.content.length : 0), 0)
			).toBeLessThanOrEqual(4000);
		});
	});

	describe('modals', () => {
		test('GIVEN the type of a rule to create THEN the modal carries it', () => {
			const modal = renderAutoModerationCreateModal(context, 'Phishing');

			expect(decode(modal.custom_id)).toMatchObject({ verb: 'submit', ruleId: 'Phishing', argument: 'create' });
		});

		const action = (argument: string): AutoModerationMenuAction => ({ ownerId, verb: 'edit', ruleId: '42', section: 'options', argument });

		test('GIVEN a modal THEN it is submitted with the argument it was opened with', () => {
			const modal = renderAutoModerationModal(context, createRule('Capitals'), action('numbers'))!;

			expect(decode(modal.custom_id)).toMatchObject({ verb: 'submit', ruleId: '42', argument: 'numbers' });
			expect(flatten(modal.components).filter((entry) => typeof entry.label === 'string')).toHaveLength(2);
		});

		test('GIVEN the duration and the threshold THEN each has its modal, with its inputs only', () => {
			const labels = (argument: string) =>
				flatten(renderAutoModerationModal(context, createRule('Links'), action(argument))!.components)
					.filter((entry) => typeof entry.label === 'string')
					.map((entry) => entry.custom_id);

			expect(labels('duration')).toEqual(['duration']);
			expect(labels('threshold')).toEqual(['threshold', 'period']);
		});

		test('GIVEN a rule without what the modal edits THEN there is no modal', () => {
			expect(renderAutoModerationModal(context, createRule('Attachments'), action('numbers'))).toBeNull();
			expect(renderAutoModerationModal(context, createRule('Capitals'), action('add'))).toBeNull();
			expect(renderAutoModerationModal(context, createRule('NoMentionSpam'), action('duration'))).toBeNull();
			expect(renderAutoModerationModal(context, createRule('NoMentionSpam'), action('threshold'))).toBeNull();
			expect(renderAutoModerationModal(context, createRule('Links'), action('nothing'))).toBeNull();
		});
	});

	describe('lists', () => {
		test('GIVEN entries separated by commas and new lines THEN they are split, trimmed and unique', () => {
			expect(parseAutoModerationMenuEntries(' one, two\nthree ,, one\n')).toEqual(['one', 'two', 'three']);
		});

		test('GIVEN entries to add THEN the new ones are added and the others skipped', () => {
			const rule = createRule('Links', { options: { allowed: ['example.com'] } });
			const result = editAutoModerationMenuList(t, rule, ['example.com', 'https://wolfstar.rocks/home', 'Skyra.pw'], 'add');

			expect(result).toMatchObject({ changed: 2, skipped: 1 });
			expect(result.update).toEqual({ options: { allowed: ['example.com', 'wolfstar.rocks', 'skyra.pw'] } });
		});

		test('GIVEN entries of both lists of an invites rule THEN each goes to its list', () => {
			const result = editAutoModerationMenuList(t, createRule('Invites'), ['254360814063058944', 'https://discord.gg/wolfstar'], 'add');

			expect(result.update).toEqual({ options: { allowedCodes: ['wolfstar'], allowedGuilds: ['254360814063058944'] } });
		});

		test('GIVEN nothing that changes THEN there is no update', () => {
			const rule = createRule('Links', { options: { allowed: ['example.com'] } });

			expect(editAutoModerationMenuList(t, rule, ['other.com'], 'remove')).toMatchObject({ update: null, changed: 0, skipped: 1 });
			expect(editAutoModerationMenuList(t, createRule('Capitals'), ['x'], 'add').update).toBeNull();
		});

		test('GIVEN a rule with lists THEN clearing empties them and keeps the rest', () => {
			const rule = createRule('Invites', { options: { allowedCodes: ['a'], allowedGuilds: ['1'] } });

			expect(clearAutoModerationMenuList(rule)).toEqual({ options: { allowedCodes: [], allowedGuilds: [] } });
			expect(clearAutoModerationMenuList(createRule('Capitals'))).toEqual({ options: { minimum: 15, maximum: 50 } });
		});
	});

	describe('numbers', () => {
		test('GIVEN a rule THEN its numbers are the ones of its type', () => {
			expect(getAutoModerationMenuNumberFields(createRule('Capitals')).map((field) => field.key)).toEqual(['minimum', 'maximum']);
			expect(getAutoModerationMenuNumberFields(createRule('Links'))).toEqual([]);
		});

		test('GIVEN valid numbers THEN they are set on top of the options', () => {
			const parsed = parseAutoModerationMenuNumbers(t, createRule('Capitals'), read({ minimum: '20', maximum: ' 80 ' }));

			expect(parsed).toEqual({ ok: true, value: { options: { minimum: 20, maximum: 80 } } });
		});

		test('GIVEN a number out of its limits, or no number THEN it is refused', () => {
			expect(parseAutoModerationMenuNumbers(t, createRule('Capitals'), read({ minimum: '20', maximum: '500' })).ok).toBe(false);
			expect(parseAutoModerationMenuNumbers(t, createRule('Capitals'), read({ minimum: 'many', maximum: '50' })).ok).toBe(false);
			expect(parseAutoModerationMenuNumbers(t, createRule('Capitals'), read({ maximum: '50' })).ok).toBe(false);
		});
	});

	describe('timing', () => {
		test('GIVEN a duration, a threshold and a period THEN they are read', () => {
			const parsed = parseAutoModerationMenuTiming(t, read({ duration: '1h', threshold: '5', period: '2m' }));

			expect(parsed).toEqual({ ok: true, value: { hardActionDuration: 3_600_000, thresholdMaximum: 5, thresholdDuration: 120_000 } });
		});

		test('GIVEN no duration THEN the punishment is permanent, and no period keeps the one of the rule', () => {
			expect(parseAutoModerationMenuTiming(t, read({ duration: '', threshold: '0', period: '' }))).toEqual({
				ok: true,
				value: { hardActionDuration: null, thresholdMaximum: 0 }
			});
		});

		test('GIVEN only the inputs of one modal THEN only what it edits changes', () => {
			expect(parseAutoModerationMenuTiming(t, read({ duration: '1h' }))).toEqual({ ok: true, value: { hardActionDuration: 3_600_000 } });
			expect(parseAutoModerationMenuTiming(t, read({ threshold: '3', period: '30s' }))).toEqual({
				ok: true,
				value: { thresholdMaximum: 3, thresholdDuration: 30_000 }
			});
		});

		test('GIVEN what is not a duration or a threshold THEN it is refused', () => {
			expect(parseAutoModerationMenuTiming(t, read({ duration: 'soon', threshold: '5' })).ok).toBe(false);
			expect(parseAutoModerationMenuTiming(t, read({ duration: '1h', threshold: '5000' })).ok).toBe(false);
			expect(parseAutoModerationMenuTiming(t, read({ duration: '1h', threshold: '-1' })).ok).toBe(false);
		});

		test('GIVEN a duration THEN it is written the way it is read back', () => {
			expect(formatAutoModerationMenuDuration(null)).toBe('');
			expect(formatAutoModerationMenuDuration(0)).toBe('');
			expect(formatAutoModerationMenuDuration(60_000)).toBe('1m');
			expect(formatAutoModerationMenuDuration(93_784_000)).toBe('1d 2h 3m 4s');

			const parsed = parseAutoModerationMenuTiming(t, read({ duration: formatAutoModerationMenuDuration(93_784_000), threshold: '1' }));
			expect(parsed).toMatchObject({ ok: true, value: { hardActionDuration: 93_784_000 } });
		});
	});

	describe('exemptions', () => {
		test('GIVEN the list the menu showed THEN what was picked takes its place', () => {
			const rule = createRule('Links', { ignoredRoles: ['1', '2'] });
			const revision = getAutoModerationMenuRevision(rule.ignoredRoles);

			expect(setAutoModerationMenuExemptions(rule, 'ignoredRoles', revision, ['2', '3'])).toEqual({ ignoredRoles: ['2', '3'] });
		});

		test('GIVEN a list that changed since the menu was rendered THEN nothing is written', () => {
			const revision = getAutoModerationMenuRevision(['1', '2']);
			const rule = createRule('Links', { ignoredRoles: ['1', '2', '9'] });

			expect(setAutoModerationMenuExemptions(rule, 'ignoredRoles', revision, ['1'])).toBeNull();
			expect(setAutoModerationMenuExemptions(rule, 'ignoredChannels', revision, ['1'])).toBeNull();
		});
	});

	describe('switches', () => {
		test('GIVEN a switch THEN it is flipped', () => {
			const rule = createRule('NoMentionSpam', { softAction: 0b001 });

			expect(toggleAutoModerationMenuSwitch(rule, 'enabled')).toEqual({ enabled: false });
			expect(toggleAutoModerationMenuSwitch(rule, 'delete')).toEqual({ softAction: 0b000 });
			expect(toggleAutoModerationMenuSwitch(rule, 'alert')).toEqual({ softAction: 0b101 });
			expect(toggleAutoModerationMenuSwitch(rule, 'alerts')).toMatchObject({ options: { alerts: true } });
		});

		test('GIVEN a switch the rule does not have THEN nothing changes', () => {
			expect(toggleAutoModerationMenuSwitch(createRule('Links'), 'alerts')).toBeNull();
			expect(toggleAutoModerationMenuSwitch(createRule('Links'), 'everything')).toBeNull();
		});
	});
});
