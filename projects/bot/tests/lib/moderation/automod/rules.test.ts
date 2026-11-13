import {
	AutoModerationRuleError,
	createAutoModerationRule,
	deleteAutoModerationRule,
	readAutoModerationRules,
	updateAutoModerationRule
} from '#lib/moderation/automod/rules';
import { container } from '@wolfstar/http-framework';
import { getDefaultAutoModerationRule, MaximumAutoModerationRules, type AutoModerationRule, type AutoModerationRuleData } from 'wolfstar-database';

// The rules of each guild, in place of the table:
const { table } = vi.hoisted(() => ({ table: new Map<string, AutoModerationRule[]>() }));
let nextId = 1;

vi.mock('wolfstar-database', async (importOriginal) => ({
	...(await importOriginal<typeof import('wolfstar-database')>()),
	fetchAutoModerationRules: vi.fn(async (_orm: unknown, guildId: string) => [...(table.get(guildId) ?? [])]),
	createAutoModerationRule: vi.fn(async (_db: unknown, guildId: string, data: AutoModerationRuleData) => {
		const rule = { ...data, id: String(nextId++), guildId } as AutoModerationRule;
		table.set(guildId, [...(table.get(guildId) ?? []), rule]);
		return rule;
	}),
	updateAutoModerationRule: vi.fn(async (_db: unknown, guildId: string, ruleId: string, data: Partial<AutoModerationRuleData>) => {
		const rules = table.get(guildId) ?? [];
		const index = rules.findIndex((rule) => rule.id === ruleId);
		if (index === -1) return false;
		table.set(guildId, rules.with(index, { ...rules[index], ...data } as AutoModerationRule));
		return true;
	}),
	deleteAutoModerationRule: vi.fn(async (_db: unknown, guildId: string, ruleId: string) => {
		const rules = table.get(guildId) ?? [];
		table.set(
			guildId,
			rules.filter((rule) => rule.id !== ruleId)
		);
		return rules.some((rule) => rule.id === ruleId);
	})
}));

const guildId = '254360814063058944';

async function getCode(promise: Promise<unknown>) {
	const error = await promise.then(
		() => null,
		(error: unknown) => error
	);
	return error instanceof AutoModerationRuleError ? error.code : error;
}

describe('auto-moderation rule manager', () => {
	beforeAll(() => {
		// The storage is mocked, the manager only passes the database on:
		container.prisma ??= {} as typeof container.prisma;
	});

	beforeEach(async () => {
		for (const rule of await readAutoModerationRules(guildId)) await deleteAutoModerationRule(guildId, rule.id);
		table.clear();
	});

	describe('names', () => {
		test('GIVEN a name THEN it is trimmed', async () => {
			expect((await createAutoModerationRule(guildId, '  Links  ', 'Links')).name).toBe('Links');
		});

		test('GIVEN a name another rule has THEN the case does not make it another name', async () => {
			await createAutoModerationRule(guildId, 'Links', 'Links');

			expect(await getCode(createAutoModerationRule(guildId, 'links', 'Words'))).toBe('nameTaken');
		});

		test('GIVEN a name that is empty, too long or made of digits THEN it is refused', async () => {
			expect(await getCode(createAutoModerationRule(guildId, '   ', 'Links'))).toBe('nameInvalid');
			expect(await getCode(createAutoModerationRule(guildId, 'a'.repeat(51), 'Links'))).toBe('nameInvalid');
			expect(await getCode(createAutoModerationRule(guildId, '12345', 'Links'))).toBe('nameInvalid');
		});

		test('GIVEN a rule renamed to its own name THEN it is not taken', async () => {
			const rule = await createAutoModerationRule(guildId, 'Links', 'Links');

			expect((await updateAutoModerationRule(guildId, rule.id, { name: 'LINKS' })).name).toBe('LINKS');
		});
	});

	describe('limits', () => {
		test('GIVEN a guild with the most rules THEN one more is refused', async () => {
			for (let index = 0; index < MaximumAutoModerationRules; index++) await createAutoModerationRule(guildId, `Rule ${index}`, 'Links');

			expect(await getCode(createAutoModerationRule(guildId, 'One more', 'Links'))).toBe('limit');
			expect(await readAutoModerationRules(guildId)).toHaveLength(MaximumAutoModerationRules);
		});

		test('GIVEN two creations of the same name at once THEN only one goes through', async () => {
			const codes = await Promise.all([
				getCode(createAutoModerationRule(guildId, 'Same', 'Links')),
				getCode(createAutoModerationRule(guildId, 'same', 'Links'))
			]);

			expect(codes).toEqual([null, 'nameTaken']);
		});
	});

	describe('changes', () => {
		test('GIVEN an ID that is not one THEN the rule is unknown', async () => {
			expect(await getCode(deleteAutoModerationRule(guildId, 'abc'))).toBe('unknown');
			expect(await getCode(deleteAutoModerationRule(guildId, '1.5'))).toBe('unknown');
			expect(await getCode(updateAutoModerationRule(guildId, '999999', { enabled: false }))).toBe('unknown');
		});

		test('GIVEN two additions to a list at once THEN both are kept', async () => {
			const rule = await createAutoModerationRule(guildId, 'Words', 'Words');
			const add = (word: string) =>
				updateAutoModerationRule(guildId, rule.id, (current) => ({
					options: { words: [...(current as AutoModerationRule<'Words'>).options.words, word] }
				}));

			await Promise.all([add('first'), add('second')]);

			const [updated] = await readAutoModerationRules(guildId);
			expect(updated.options).toEqual({ words: ['first', 'second'] });
		});

		test('GIVEN a change THEN the cached rules are read again', async () => {
			const rule = await createAutoModerationRule(guildId, 'Links', 'Links');
			expect((await readAutoModerationRules(guildId))[0].enabled).toBe(true);

			await updateAutoModerationRule(guildId, rule.id, { enabled: false });
			expect((await readAutoModerationRules(guildId))[0].enabled).toBe(false);
		});

		test('GIVEN a function that changes nothing THEN the rule is returned as it is', async () => {
			const rule = await createAutoModerationRule(guildId, 'Links', 'Links', { softAction: 3 });

			expect(await updateAutoModerationRule(guildId, rule.id, () => null)).toMatchObject({
				...getDefaultAutoModerationRule('Links'),
				softAction: 3
			});
		});
	});
});
