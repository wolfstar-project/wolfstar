import { getConfigurableKeys, Serializer, SerializerStore } from '#lib/database';
import {
	ConfigurationFileVersion,
	createConfigurationFile,
	findPortableKey,
	getPortableKeys,
	isPortableKey
} from '#lib/database/settings/transfer/format';
import { parseConfigurationFile } from '#lib/database/settings/transfer/parse';
import {
	countPlannedRules,
	findOversizedRuleLists,
	getPlannedRules,
	getPlannedSettings,
	planConfigurationImport
} from '#lib/database/settings/transfer/plan';
import { renderConfigurationIssues, renderConfigurationPreview } from '#lib/database/settings/transfer/render';
import { UserSerializer as BooleanSerializer } from '#root/serializers/boolean';
import { UserSerializer as HoneypotActionSerializer } from '#root/serializers/honeypotAction';
import { UserSerializer as TimezoneSerializer } from '#root/serializers/timezone';
import { UserSerializer as MessageUpdateStyleSerializer } from '#root/serializers/messageUpdateStyle';
import { UserSerializer as NumberSerializer } from '#root/serializers/number';
import { UserSerializer as StringSerializer } from '#root/serializers/string';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';
import {
	getDefaultAutoModerationRule,
	getDefaultGuildSettings,
	MaximumAutoModerationRuleListLength,
	MaximumAutoModerationRules,
	type AutoModerationRule,
	type AutoModerationRuleType,
	type ReadonlyGuildData
} from 'wolfstar-database';

const guildId = '254360814063058944';

// Echoes the key and its options, the translations are not what is tested here:
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key);

/** Accepts the names that start with `ok`, what the real one asks of the command store is not what is tested here. */
class CommandMatchSerializer extends Serializer<string> {
	public parse(input: string) {
		return this.ok(input);
	}

	public isValid(value: string) {
		if (!value.startsWith('ok')) throw `not a command: ${value}`;
		return true;
	}
}

class LanguageSerializer extends Serializer<string> {
	public parse(input: string) {
		return this.ok(input);
	}

	public isValid(value: string) {
		return ['en-US', 'it'].includes(value);
	}
}

function createSettings(overrides: Partial<ReadonlyGuildData> = {}) {
	return { ...getDefaultGuildSettings(), id: guildId, ...overrides } as ReadonlyGuildData;
}

function createRule<Type extends AutoModerationRuleType>(type: Type, name: string, id = '1', overrides: Partial<AutoModerationRule> = {}) {
	return { ...getDefaultAutoModerationRule(type), id, guildId, name, ...overrides } as AutoModerationRule;
}

const context = (rules: readonly AutoModerationRule[] = []) => ({
	settings: createSettings(),
	rules,
	guild: { id: guildId } as Guild,
	t: t as never
});
const parse = (file: unknown, rules: readonly AutoModerationRule[] = []) =>
	parseConfigurationFile(typeof file === 'string' ? file : JSON.stringify(file), context(rules));

async function parseOk(file: unknown, rules: readonly AutoModerationRule[] = []) {
	const result = await parse(file, rules);
	if (!result.ok) throw new Error(`Expected a valid file: ${JSON.stringify(result.issues)}`);
	return result.value;
}

async function parseIssues(file: unknown, rules: readonly AutoModerationRule[] = []) {
	const result = await parse(file, rules);
	if (result.ok) throw new Error('Expected the file to be refused.');
	return result.issues;
}

beforeAll(async () => {
	container.stores.register(new SerializerStore());
	const pieces = {
		boolean: BooleanSerializer,
		number: NumberSerializer,
		string: StringSerializer,
		commandMatch: CommandMatchSerializer,
		language: LanguageSerializer,
		honeypotAction: HoneypotActionSerializer,
		timezone: TimezoneSerializer,
		messageUpdateStyle: MessageUpdateStyleSerializer
	};
	for (const [name, piece] of Object.entries(pieces)) {
		await container.stores.loadPiece({ store: 'serializers', name, piece: piece as never });
	}
	// The pieces registered by hand are constructed when the store loads:
	await container.stores.get('serializers').loadAll();
});

describe('configuration file', () => {
	describe('portable settings', () => {
		test('GIVEN the settings THEN only the ones that do not depend on the server are portable', () => {
			// A new setting of one of these types has to be looked at: this list is what a file carries across servers.
			expect(getPortableKeys().map((key) => key.name)).toEqual([
				'language',
				'timezone',
				'modules.automod',
				'modules.moderation',
				'modules.logs',
				'modules.commands',
				'modules.roles',
				'automod.track-native',
				'commands.disabled',
				'honeypot.action',
				'honeypot.direct-message',
				'honeypot.warning',
				'honeypot.random-name',
				'honeypot.keep-active',
				'logs.message-update-style',
				'logs.reaction-emoji-include-twemoji',
				'logs.webhooks',
				'moderation.track-bans',
				'moderation.track-timeouts',
				'moderation.track-roles',
				'reports.anonymous',
				'reports.notify',
				'roles.remove-initial'
			]);
		});

		test('GIVEN a setting of a role, a channel or a user THEN it is not portable', () => {
			for (const property of ['rolesAdmin', 'rolesMuted', 'logsMemberAdd', 'automodChannel', 'reportsBlockedUsers', 'permissionsRoles']) {
				expect(isPortableKey(getConfigurableKeys().get(property as never)!)).toBe(false);
			}
		});

		test('GIVEN a name THEN the setting is found by it, and by nothing else', () => {
			expect(findPortableKey('modules.automod')?.property).toBe('modulesAutomod');
			expect(findPortableKey('modulesAutomod')).toBeNull();
			expect(findPortableKey('roles.admin')).toBeNull();
		});
	});

	describe('createConfigurationFile', () => {
		const now = new Date('2026-10-11T08:30:00.000Z');

		test('GIVEN a server THEN the file has the version, the date, the portable settings and the rules', () => {
			const settings = createSettings({
				language: 'it',
				modulesLogs: false,
				commandsDisabled: ['ping'],
				rolesAdmin: ['1'],
				logsMemberAdd: '2'
			});
			const file = createConfigurationFile(settings, [createRule('Links', 'No links')], now);

			expect(file.version).toBe(ConfigurationFileVersion);
			expect(file.exportedAt).toBe('2026-10-11T08:30:00.000Z');
			expect(file.settings).toMatchObject({ language: 'it', 'modules.logs': false, 'commands.disabled': ['ping'] });
			expect(Object.keys(file.settings)).toHaveLength(getPortableKeys().length);
			expect(JSON.stringify(file)).not.toContain('"roles.admin"');
			expect(file.automod.rules).toHaveLength(1);
		});

		test('GIVEN a rule with exempt roles and channels THEN they are not in the file, nor are its IDs', () => {
			const rule = createRule('Links', 'No links', '77', { ignoredRoles: ['100000000000000001'], ignoredChannels: ['100000000000000002'] });
			const [entry] = createConfigurationFile(createSettings(), [rule], now).automod.rules;

			expect(entry).not.toHaveProperty('ignoredRoles');
			expect(entry).not.toHaveProperty('ignoredChannels');
			expect(entry).not.toHaveProperty('id');
			expect(entry).not.toHaveProperty('guildId');
			expect(entry).toMatchObject({ name: 'No links', type: 'Links', enabled: true });
		});

		test('GIVEN the file THEN it is read back as it is', async () => {
			const settings = createSettings({ modulesLogs: false, commandsDisabled: ['ok-ping'] });
			const rules = [createRule('Words', 'Bad words', '1', { options: { words: ['spam'] } })];
			const file = createConfigurationFile(settings, rules, now);

			const parsed = await parseOk(JSON.parse(JSON.stringify(file)));
			const plan = planConfigurationImport(settings, rules, parsed);
			expect(plan.isEmpty).toBe(true);
		});
	});

	describe('parseConfigurationFile', () => {
		const valid = { version: 1, settings: { 'modules.logs': false }, automod: { rules: [] } };

		test('GIVEN a valid file THEN it is read', async () => {
			const parsed = await parseOk(valid);

			expect(parsed.settings).toEqual([{ key: findPortableKey('modules.logs'), value: false }]);
			expect(parsed.rules).toEqual([]);
		});

		test('GIVEN a file without the sections THEN they are left out', async () => {
			const parsed = await parseOk({ version: 1 });

			expect(parsed.settings).toEqual([]);
			expect(parsed.rules).toBeNull();
		});

		test('GIVEN text that is not JSON THEN it is refused', async () => {
			expect(await parseIssues('{ nope')).toEqual([{ path: '', message: 'commands/conf:transferErrorJson' }]);
			expect((await parseIssues('[]'))[0].message).toBe('commands/conf:transferErrorObject');
			expect((await parseIssues('"text"'))[0].message).toBe('commands/conf:transferErrorObject');
		});

		test('GIVEN no version, or another one THEN it is refused', async () => {
			expect((await parseIssues({ settings: {} }))[0]).toMatchObject({ path: 'version', message: 'commands/conf:transferErrorVersion' });
			expect((await parseIssues({ version: '1' }))[0].path).toBe('version');
			expect((await parseIssues({ version: 2 }))[0].message).toContain('transferErrorVersionUnsupported');
		});

		test('GIVEN a field that is not of the file THEN it is refused', async () => {
			expect(await parseIssues({ version: 1, roles: [] })).toMatchObject([{ path: 'roles' }]);
			expect(await parseIssues({ version: 1, automod: { rules: [], extra: 1 } })).toMatchObject([{ path: 'automod.extra' }]);
		});

		test('GIVEN a setting that depends on the server, or does not exist, THEN the file is refused instead of ignoring it', async () => {
			const issues = await parseIssues({ version: 1, settings: { 'roles.admin': ['1'], 'logs.member-add': '2', 'no.such': true } });

			expect(issues.map((issue) => issue.path)).toEqual(['settings.roles.admin', 'settings.logs.member-add', 'settings.no.such']);
		});

		test('GIVEN values of the wrong type THEN they are refused', async () => {
			const issues = await parseIssues({
				version: 1,
				settings: { 'modules.logs': 'yes', language: 3, 'commands.disabled': 'ok-ping', 'reports.notify': [true] }
			});

			expect(issues.map((issue) => issue.path)).toEqual([
				'settings.modules.logs',
				'settings.language',
				'settings.commands.disabled',
				'settings.reports.notify'
			]);
			expect(issues[0].message).toContain('transferErrorWrongType');
			expect(issues[2].message).toContain('transferErrorExpectedArray');
			expect(issues[3].message).toContain('transferErrorExpectedValue');
		});

		test('GIVEN a value its serializer does not accept THEN it is refused with its reason', async () => {
			const issues = await parseIssues({ version: 1, settings: { language: 'xx', 'commands.disabled': ['ok-ping', 'nope'] } });

			expect(issues[0].message).toContain('transferErrorInvalidValue');
			expect(issues[1]).toEqual({ path: 'settings.commands.disabled', message: 'not a command: nope' });
		});

		test('GIVEN a list THEN its duplicates are dropped and its maximum holds', async () => {
			const parsed = await parseOk({ version: 1, settings: { 'commands.disabled': ['ok-a', 'ok-b', 'ok-a'] } });
			expect(parsed.settings[0].value).toEqual(['ok-a', 'ok-b']);

			const tooMany = Array.from({ length: 33 }, (_, index) => `ok-${index}`);
			const issues = await parseIssues({ version: 1, settings: { 'commands.disabled': tooMany } });
			expect(issues[0].message).toContain('menuTooManyValues');
		});

		test('GIVEN every problem THEN every one is reported, and the file is not partly accepted', async () => {
			const issues = await parseIssues({
				version: 1,
				settings: { language: 'xx', 'modules.logs': false },
				automod: { rules: [{ type: 'Links', name: '' }] }
			});

			expect(issues.map((issue) => issue.path)).toEqual(['settings.language', 'automod.rules[0].name']);
		});

		describe('rules', () => {
			test('GIVEN a rule with only a name and a type THEN the rest takes the defaults of the type', async () => {
				const parsed = await parseOk({ version: 1, automod: { rules: [{ name: ' Links ', type: 'Links' }] } });
				const { ignoredRoles, ignoredChannels, ...defaults } = getDefaultAutoModerationRule('Links');

				expect(ignoredRoles).toEqual([]);
				expect(ignoredChannels).toEqual([]);
				expect(parsed.rules).toEqual([{ ...defaults, name: 'Links' }]);
			});

			test('GIVEN the options of a rule THEN they are read as the API reads them', async () => {
				const parsed = await parseOk({
					version: 1,
					automod: { rules: [{ name: 'Words', type: 'Words', options: { words: [' BadWord ', 'BADWORD'] } }] }
				});

				expect(parsed.rules?.[0].options).toEqual({ words: ['badword'] });
			});

			test('GIVEN some of the options of a rule THEN the others take the defaults of the type', async () => {
				const parsed = await parseOk({ version: 1, automod: { rules: [{ name: 'Caps', type: 'Capitals', options: { minimum: 30 } }] } });

				expect(parsed.rules?.[0].options).toEqual({ minimum: 30, maximum: 50 });
			});

			test('GIVEN options of the wrong type THEN the file is refused instead of taking their defaults', async () => {
				const rule = (type: string, options: unknown) => ({ name: `Rule ${type}`, type, options });
				const issues = await parseIssues({
					version: 1,
					automod: {
						rules: [
							rule('Words', { words: 'spam' }),
							rule('Links', { allowed: { 0: 'example.com' } }),
							rule('Capitals', { minimum: '30', maximum: null }),
							rule('NoMentionSpam', { alerts: 'yes' }),
							rule('Invites', 'none')
						]
					}
				});

				expect(issues.map((issue) => issue.path)).toEqual([
					'automod.rules[0].options.words',
					'automod.rules[1].options.allowed',
					'automod.rules[2].options.minimum',
					'automod.rules[2].options.maximum',
					'automod.rules[3].options.alerts',
					'automod.rules[4].options'
				]);
			});

			test('GIVEN a number out of its limits THEN the file is refused instead of bringing it within them', async () => {
				const issues = await parseIssues({
					version: 1,
					automod: { rules: [{ name: 'Caps', type: 'Capitals', options: { minimum: 1, maximum: 50.5 } }] }
				});

				expect(issues.map((issue) => issue.path)).toEqual(['automod.rules[0].options.minimum', 'automod.rules[0].options.maximum']);
				expect(issues[0].message).toContain('between 5 and 2000');
			});

			test('GIVEN an entry of a list that is not valid THEN the file is refused instead of dropping it', async () => {
				const issues = await parseIssues({
					version: 1,
					automod: {
						rules: [
							{ name: 'Words', type: 'Words', options: { words: ['spam', 'x', 5, 'a'.repeat(33)] } },
							{ name: 'Links', type: 'Links', options: { allowed: ['example.com', '  ', null] } }
						]
					}
				});

				expect(issues.map((issue) => issue.path)).toEqual([
					'automod.rules[0].options.words[1]',
					'automod.rules[0].options.words[2]',
					'automod.rules[0].options.words[3]',
					'automod.rules[1].options.allowed[1]',
					'automod.rules[1].options.allowed[2]'
				]);
			});

			test('GIVEN an option the type does not have THEN the file is refused instead of ignoring it', async () => {
				const issues = await parseIssues({
					version: 1,
					automod: { rules: [{ name: 'Links', type: 'Links', options: { allowed: [], words: ['spam'] } }] }
				});

				expect(issues.map((issue) => issue.path)).toEqual(['automod.rules[0].options.words']);
			});

			test('GIVEN a broken file THEN it cannot empty the list of a rule of the server', async () => {
				const rules = [createRule('Words', 'Words', '1', { options: { words: ['spam', 'scam'] } })];
				const result = await parse({ version: 1, automod: { rules: [{ name: 'Words', type: 'Words', options: { words: 'spam' } }] } });

				expect(result.ok).toBe(false);
				// The rule of the server is only ever planned from a file that was read:
				expect(rules[0].options).toEqual({ words: ['spam', 'scam'] });
			});

			test('GIVEN exempt roles and channels THEN they are refused, since they depend on the server', async () => {
				const issues = await parseIssues({
					version: 1,
					automod: { rules: [{ name: 'Links', type: 'Links', ignoredRoles: ['100000000000000001'], id: '5' }] }
				});

				expect(issues.map((issue) => issue.path)).toEqual(['automod.rules[0].ignoredRoles', 'automod.rules[0].id']);
			});

			test('GIVEN a rule that is not valid THEN it is refused', async () => {
				const issues = await parseIssues({
					version: 1,
					automod: {
						rules: [
							'text',
							{ name: 'No type' },
							{ name: '12345', type: 'Links' },
							{ name: 'Bad action', type: 'Links', hardAction: 'Explode' },
							{ name: 'Bad threshold', type: 'Links', thresholdMaximum: 1000 }
						]
					}
				});

				expect(issues.map((issue) => issue.path)).toEqual([
					'automod.rules[0]',
					'automod.rules[1].type',
					'automod.rules[2].name',
					'automod.rules[3].hardAction',
					'automod.rules[4].thresholdMaximum'
				]);
			});

			describe('lists longer than the limit', () => {
				const words = (length: number) => Array.from({ length }, (_, index) => `word${index}`);
				const over = MaximumAutoModerationRuleListLength + 1;
				const file = (length: number, name = 'Words') => ({
					version: 1,
					automod: { rules: [{ name, type: 'Words', options: { words: words(length) } }] }
				});

				test('GIVEN a list at the limit THEN it is read in any server', async () => {
					const parsed = await parseOk(file(MaximumAutoModerationRuleListLength));

					expect(parsed.rules?.[0].options).toEqual({ words: words(MaximumAutoModerationRuleListLength) });
				});

				test('GIVEN the backup of a rule that holds more THEN it is restored on that rule, whole', async () => {
					const rules = [createRule('Words', 'words', '1', { options: { words: words(over) } })];
					const parsed = await parseOk(file(over), rules);

					expect(parsed.rules?.[0].options).toEqual({ words: words(over) });
					expect(planConfigurationImport(createSettings(), rules, parsed).rules).toMatchObject({ update: [{ fields: ['name'] }] });
				});

				test('GIVEN a rule that holds more than the file THEN the list of the file can be shorter and still over the limit', async () => {
					const rules = [createRule('Words', 'Words', '1', { options: { words: words(over + 10) } })];
					const parsed = await parseOk(file(over), rules);

					expect(parsed.rules?.[0].options).toEqual({ words: words(over) });
				});

				test('GIVEN no rule of that name and type, or one that holds less, THEN the file cannot make the list grow', async () => {
					const expected = [{ path: 'automod.rules[0].options.words' }];

					expect(await parseIssues(file(over))).toMatchObject(expected);
					expect(await parseIssues(file(over), [createRule('Words', 'Other', '1', { options: { words: words(over) } })])).toMatchObject(
						expected
					);
					expect(await parseIssues(file(over), [createRule('Links', 'Words', '1')])).toMatchObject(expected);
					expect(await parseIssues(file(over), [createRule('Words', 'Words', '1', { options: { words: words(over - 1) } })])).toMatchObject(
						expected
					);
					expect(await parseIssues(file(over + 1), [createRule('Words', 'Words', '1', { options: { words: words(over) } })])).toMatchObject(
						expected
					);
				});

				test('GIVEN every list of the options THEN each has the allowance', async () => {
					const entries = (prefix: string) => Array.from({ length: over }, (_, index) => `${prefix}${index}`);
					const invites = { allowedCodes: entries('code'), allowedGuilds: entries('10000000000000') };
					const links = { allowed: entries('host').map((host) => `${host}.com`) };
					const rules = [
						{ name: 'Invites', type: 'Invites', options: invites },
						{ name: 'Links', type: 'Links', options: links },
						{ name: 'Phishing', type: 'Phishing', options: links }
					];
					const server = [
						createRule('Invites', 'Invites', '1', { options: invites }),
						createRule('Links', 'Links', '2', { options: links }),
						createRule('Phishing', 'Phishing', '3', { options: links })
					];

					const parsed = await parseOk({ version: 1, automod: { rules } }, server);
					expect(planConfigurationImport(createSettings(), server, parsed).isEmpty).toBe(true);

					const issues = await parseIssues({ version: 1, automod: { rules } });
					expect(issues.map((issue) => issue.path)).toEqual([
						'automod.rules[0].options.allowedCodes',
						'automod.rules[0].options.allowedGuilds',
						'automod.rules[1].options.allowed',
						'automod.rules[2].options.allowed'
					]);
				});

				test('GIVEN the rule lost entries after the file was read THEN the list of the file is found too long', async () => {
					const rule = createRule('Words', 'Words', '1', { options: { words: words(over) } });
					const parsed = await parseOk(file(over), [rule]);

					expect(findOversizedRuleLists([rule], parsed)).toEqual([]);
					expect(findOversizedRuleLists([{ ...rule, options: { words: words(5) } }], parsed)).toEqual([{ rule: 'Words', option: 'words' }]);
					expect(findOversizedRuleLists([], parsed)).toEqual([{ rule: 'Words', option: 'words' }]);
				});
			});

			test('GIVEN two rules with the same name, whatever the case, THEN the file is refused', async () => {
				const issues = await parseIssues({
					version: 1,
					automod: {
						rules: [
							{ name: 'Links', type: 'Links' },
							{ name: 'links', type: 'Invites' }
						]
					}
				});

				expect(issues).toMatchObject([{ path: 'automod.rules[1]' }]);
				expect(issues[0].message).toContain('transferErrorRuleNameTaken');
			});

			test('GIVEN more rules than a server holds THEN the file is refused', async () => {
				const rules = Array.from({ length: MaximumAutoModerationRules + 1 }, (_, index) => ({ name: `Rule ${index}`, type: 'Links' }));
				const issues = await parseIssues({ version: 1, automod: { rules } });

				expect(issues).toMatchObject([{ path: 'automod.rules' }]);
				expect(issues[0].message).toContain(`"maximum":${MaximumAutoModerationRules}`);

				const allowed = await parseOk({ version: 1, automod: { rules: rules.slice(0, MaximumAutoModerationRules) } });
				expect(allowed.rules).toHaveLength(MaximumAutoModerationRules);
			});

			test('GIVEN a rules section that is not a list THEN the file is refused', async () => {
				expect(await parseIssues({ version: 1, automod: {} })).toMatchObject([{ path: 'automod.rules' }]);
				expect(await parseIssues({ version: 1, automod: { rules: {} } })).toMatchObject([{ path: 'automod.rules' }]);
				expect(await parseIssues({ version: 1, automod: [] })).toMatchObject([{ path: 'automod' }]);
			});
		});
	});

	describe('planConfigurationImport', () => {
		const file = (rules: unknown[] | undefined, settings: Record<string, unknown> = {}) =>
			parseOk({ version: 1, settings, ...(rules ? { automod: { rules } } : {}) });

		test('GIVEN settings THEN only the ones that differ are changed', async () => {
			const settings = createSettings({ modulesLogs: false });
			const parsed = await file(undefined, { 'modules.logs': false, 'modules.roles': false, 'commands.disabled': ['ok-a'] });
			const plan = planConfigurationImport(settings, [], parsed);

			expect(plan.settings.map((change) => change.key.property)).toEqual(['modulesRoles', 'commandsDisabled']);
			expect(plan.settings[0]).toMatchObject({ before: true, after: false });
			expect(getPlannedSettings(plan)).toEqual({ modulesRoles: false, commandsDisabled: ['ok-a'] });
			expect(plan.isEmpty).toBe(false);
		});

		test('GIVEN no rules section THEN the rules of the server are left alone', async () => {
			const rules = [createRule('Links', 'Links')];
			const plan = planConfigurationImport(createSettings(), rules, await file(undefined));

			expect(plan.rules).toEqual({ create: [], update: [], remove: [], unchanged: 0 });
			expect(plan.isEmpty).toBe(true);
		});

		test('GIVEN rules THEN the rules of the server become the ones of the file', async () => {
			const rules = [
				createRule('Links', 'Links', '1'),
				createRule('Words', 'Words', '2', { options: { words: ['a1'] } }),
				createRule('Emojis', 'Emojis', '3'),
				createRule('Invites', 'Old rule', '4')
			];
			const parsed = await file([
				{ name: 'links', type: 'Links' },
				{ name: 'Words', type: 'Words', options: { words: ['spam'] }, enabled: false },
				{ name: 'Emojis', type: 'Capitals' },
				{ name: 'New rule', type: 'Newlines' }
			]);
			const plan = planConfigurationImport(createSettings(), rules, parsed);

			// The name only differs in its case, which is the same rule:
			expect(plan.rules.update.map(({ rule, fields }) => [rule.id, fields])).toEqual([
				['1', ['name']],
				['2', ['enabled', 'options']]
			]);
			expect(plan.rules.create.map(({ data, replaces }) => [data.name, data.type, replaces])).toEqual([
				['Emojis', 'Capitals', null],
				['New rule', 'Newlines', null]
			]);
			// A rule of another type is made again, since its options depend on it:
			expect(plan.rules.remove.map((rule) => rule.id)).toEqual(['3', '4']);
			expect(plan.rules.unchanged).toBe(0);
		});

		test('GIVEN the plan THEN a rule is edited with what differs, and its exempt roles and channels are not touched', async () => {
			const rules = [createRule('Links', 'Links', '1', { ignoredRoles: ['100000000000000001'], ignoredChannels: ['100000000000000002'] })];
			const plan = planConfigurationImport(createSettings(), rules, await file([{ name: 'Links', type: 'Links', enabled: false }]));
			const { create, update, remove } = getPlannedRules(plan);

			expect(update).toEqual([{ id: '1', data: { enabled: false } }]);
			expect(create).toEqual([]);
			expect(remove).toEqual([]);
		});

		test('GIVEN a rule that is created THEN it has no exempt roles and channels', async () => {
			const plan = planConfigurationImport(createSettings(), [], await file([{ name: 'Links', type: 'Links' }]));
			const [created] = getPlannedRules(plan).create;

			expect(created).toMatchObject({ name: 'Links', type: 'Links', ignoredRoles: [], ignoredChannels: [] });
		});

		test('GIVEN a server that already is as the file says THEN there is nothing to do', async () => {
			const rules = [createRule('Links', 'Links')];
			const plan = planConfigurationImport(createSettings(), rules, await file([{ name: 'Links', type: 'Links' }]));

			expect(plan.rules.unchanged).toBe(1);
			expect(plan.isEmpty).toBe(true);
		});
	});

	describe('the order of the rules', () => {
		const file = (rules: unknown[]) => parseOk({ version: 1, automod: { rules } });
		const words = (name: string, extra: Record<string, unknown> = {}) => ({ name, type: 'Words', ...extra });

		/**
		 * The rules of a server after a plan is written, as the database gives them: by their ID, the rules that are
		 * created taking the next ones in the order they are created.
		 */
		function write(rules: readonly AutoModerationRule[], parsed: Awaited<ReturnType<typeof file>>) {
			const { create, update, remove } = getPlannedRules(planConfigurationImport(createSettings(), rules, parsed));
			let nextId = Math.max(0, ...rules.map((rule) => Number(rule.id))) + 1;

			const kept = rules
				.filter((rule) => !remove.includes(rule.id))
				.map((rule) => ({ ...rule, ...update.find((entry) => entry.id === rule.id)?.data }) as AutoModerationRule);
			const created = create.map((data) => ({ ...data, id: String(nextId++), guildId }) as AutoModerationRule);
			return [...kept, ...created].sort((a, b) => Number(a.id) - Number(b.id));
		}

		const names = (rules: readonly AutoModerationRule[], type: AutoModerationRuleType) =>
			rules.filter((rule) => rule.type === type).map((rule) => rule.name);

		test('GIVEN the rules of a type in another order THEN the ones out of place are made again, after the ones that stay', async () => {
			const rules = [createRule('Words', 'Ban', '1', { hardAction: 'Ban' }), createRule('Words', 'Warn', '2')];
			const parsed = await file([words('Warn'), words('Ban', { hardAction: 'Ban' })]);
			const plan = planConfigurationImport(createSettings(), rules, parsed);

			expect(plan.isEmpty).toBe(false);
			expect(plan.rules.create.map(({ data, replaces }) => [data.name, replaces?.id])).toEqual([['Ban', '1']]);
			expect(plan.rules).toMatchObject({ update: [], remove: [], unchanged: 1 });
			expect(getPlannedRules(plan).remove).toEqual(['1']);

			// The warning is the first rule of the type now, as in the file, so it is the one a message is held to:
			const after = write(rules, parsed);
			expect(names(after, 'Words')).toEqual(['Warn', 'Ban']);
			expect(after.map((rule) => rule.id)).toEqual(['2', '3']);
		});

		test('GIVEN the import was written THEN importing the file again does nothing', async () => {
			const rules = [createRule('Words', 'Ban', '1'), createRule('Words', 'Warn', '2'), createRule('Words', 'Mute', '3')];
			const parsed = await file([words('Mute'), words('Warn'), words('New'), words('Ban')]);

			const after = write(rules, parsed);
			expect(names(after, 'Words')).toEqual(['Mute', 'Warn', 'New', 'Ban']);
			expect(planConfigurationImport(createSettings(), after, parsed).isEmpty).toBe(true);
		});

		test('GIVEN a new rule before the ones the server has THEN the ones of its type after it are made again', async () => {
			const rules = [createRule('Words', 'First', '1'), createRule('Words', 'Second', '2'), createRule('Links', 'Links', '3')];
			const parsed = await file([words('First'), words('New'), { name: 'Links', type: 'Links' }, words('Second')]);
			const plan = planConfigurationImport(createSettings(), rules, parsed);

			expect(plan.rules.create.map(({ data, replaces }) => [data.name, replaces?.id])).toEqual([
				['New', undefined],
				['Second', '2']
			]);
			// The rule of another type is not held to any message the others are, so it stays where it is:
			expect(plan.rules.unchanged).toBe(2);
			expect(names(write(rules, parsed), 'Words')).toEqual(['First', 'New', 'Second']);
		});

		test('GIVEN a rule that takes a type THEN the rules of that type after it are made again', async () => {
			const rules = [createRule('Links', 'Changed', '1'), createRule('Words', 'Words', '2')];
			const parsed = await file([words('Changed'), words('Words')]);
			const plan = planConfigurationImport(createSettings(), rules, parsed);

			expect(plan.rules.remove.map((rule) => rule.id)).toEqual(['1']);
			expect(plan.rules.create.map(({ data, replaces }) => [data.name, replaces?.id])).toEqual([
				['Changed', undefined],
				['Words', '2']
			]);
			expect(names(write(rules, parsed), 'Words')).toEqual(['Changed', 'Words']);
		});

		test('GIVEN the rules of different types in another order THEN nothing moves, since no message is held to both', async () => {
			const rules = [createRule('Links', 'Links', '1'), createRule('Words', 'Words', '2')];
			const plan = planConfigurationImport(createSettings(), rules, await file([words('Words'), { name: 'Links', type: 'Links' }]));

			expect(plan.isEmpty).toBe(true);
		});

		test('GIVEN a rule that is made again THEN it takes what the file says and keeps its exempt roles and channels', async () => {
			const exempt = { ignoredRoles: ['100000000000000001'], ignoredChannels: ['100000000000000002'] };
			const rules = [createRule('Words', 'Ban', '1', exempt), createRule('Words', 'Warn', '2')];
			const parsed = await file([words('Warn'), words('Ban', { enabled: false, options: { words: ['spam'] } })]);
			const { create } = getPlannedRules(planConfigurationImport(createSettings(), rules, parsed));

			expect(create).toEqual([
				{ ...getDefaultAutoModerationRule('Words'), ...exempt, name: 'Ban', enabled: false, options: { words: ['spam'] } }
			]);
		});

		test('GIVEN IDs of different lengths THEN they are compared as numbers', async () => {
			const rules = [createRule('Words', 'Nine', '9'), createRule('Words', 'Ten', '10')];
			const plan = planConfigurationImport(createSettings(), rules, await file([words('Nine'), words('Ten')]));

			expect(plan.isEmpty).toBe(true);
		});

		test('GIVEN a plan THEN the rules that move are counted apart from the ones created and deleted', async () => {
			const rules = [createRule('Words', 'Ban', '1'), createRule('Words', 'Warn', '2'), createRule('Links', 'Gone', '3')];
			const parsed = await file([words('Warn', { enabled: false }), words('Ban'), words('New')]);

			expect(countPlannedRules(planConfigurationImport(createSettings(), rules, parsed))).toEqual({
				created: 1,
				updated: 1,
				moved: 1,
				removed: 1,
				unchanged: 0
			});
		});
	});

	describe('rendering', () => {
		test('GIVEN a plan THEN the preview lists the settings and the rules it changes', async () => {
			const settings = createSettings();
			const rules = [createRule('Links', 'Links', '1'), createRule('Invites', 'Old', '2')];
			const parsed = await parseOk({
				version: 1,
				settings: { 'modules.logs': false, language: 'it' },
				automod: {
					rules: [
						{ name: 'Links', type: 'Links', enabled: false },
						{ name: 'New', type: 'Newlines' }
					]
				}
			});
			const embed = await renderConfigurationPreview(planConfigurationImport(settings, rules, parsed), { ...context(), settings });

			expect(embed.title).toBe('commands/conf:transferPreviewTitle');
			expect(embed.description).toContain('"count":2');
			expect(embed.description).toContain('"created":1,"updated":1,"moved":0,"removed":1');
			expect(embed.description).not.toContain('transferPreviewMoved');
			expect(embed.description).toContain('+ **New**');
			expect(embed.description).toContain('~ **Links**: `enabled`');
			expect(embed.description).toContain('- **Old**');
		});

		test('GIVEN a rule that changes place THEN the preview says it moves, and what that costs', async () => {
			const rules = [createRule('Words', 'Ban', '1'), createRule('Words', 'Warn', '2')];
			const parsed = await parseOk({
				version: 1,
				automod: {
					rules: [
						{ name: 'Warn', type: 'Words' },
						{ name: 'Ban', type: 'Words' }
					]
				}
			});
			const embed = await renderConfigurationPreview(planConfigurationImport(createSettings(), rules, parsed), context());

			expect(embed.description).toContain('"created":0,"updated":0,"moved":1,"removed":0,"unchanged":1');
			expect(embed.description).toContain('↕ **Ban**');
			expect(embed.description).toContain('transferPreviewMoved');
		});

		test('GIVEN many problems THEN the message keeps to the limit of a message', () => {
			const issues = Array.from({ length: 100 }, (_, index) => ({ path: `settings.key${index}`, message: 'x'.repeat(300) }));
			const content = renderConfigurationIssues(issues, t as never);

			expect(content.length).toBeLessThanOrEqual(2000);
			expect(content).toContain('"count":100');
		});
	});
});
