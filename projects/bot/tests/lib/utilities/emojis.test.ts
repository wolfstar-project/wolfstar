import { parseInternationalizationDefaultVariables } from '#lib/i18n/options';
import { EmojiDefinitions, Emojis, formatEmoji, loadApplicationEmojis } from '#utils/emojis';
import { container } from '@wolfstar/http-framework';

describe('application emojis', () => {
	// The tests have no client, so there is no REST to ask: a fake one answers what each test says.
	const rest = { get: async (_route: string): Promise<unknown> => ({ items: [] }) };
	const warn = vi.fn();
	let originalRest: unknown;
	let originalLogger: unknown;

	beforeAll(() => {
		originalRest = (container as any).rest;
		originalLogger = container.logger;
		(container as any).rest = rest;
		(container as any).logger = { warn, error: vi.fn(), debug: vi.fn(), info: vi.fn() };
	});

	afterAll(() => {
		(container as any).rest = originalRest;
		(container as any).logger = originalLogger;
	});

	beforeEach(async () => {
		warn.mockClear();
		// Start every test with what the application has none of:
		rest.get = async () => ({ items: [] });
		await loadApplicationEmojis('1');
		warn.mockClear();
	});

	test('GIVEN an application with none of the emojis THEN the ones the bot used before are written', () => {
		expect(Emojis.GreenTick).toBe('<:greenTick:1043562833905987685>');
		expect(Emojis.Loading).toBe('<a:loading:1257373445151395901>');
		expect(Emojis.GreenTickSerialized).toBe('s1043562833905987685');
		expect(Emojis.BoostLevel3).toBe('<:boostlvl3:935169145056686101>');
	});

	test('GIVEN an application that has the emojis THEN they are written with the IDs of that application, by name', async () => {
		const requested: string[] = [];
		rest.get = async (route) => {
			requested.push(route);
			return {
				items: [
					{ id: '111', name: 'greenTick', animated: false },
					{ id: '222', name: 'loading', animated: true },
					{ id: '333', name: 'someoneElses', animated: false }
				]
			};
		};

		const found = await loadApplicationEmojis('987');

		expect(requested).toEqual(['/applications/987/emojis']);
		expect(found).toBe(2);
		expect(Emojis.GreenTick).toBe('<:greenTick:111>');
		expect(Emojis.Loading).toBe('<a:loading:222>');
		expect(Emojis.GreenTickSerialized).toBe('s111');
		// What the application does not have is the one of before:
		expect(Emojis.RedCross).toBe('<:redCross:1043562794336919605>');
	});

	test('GIVEN two applications with the same names THEN the same code writes the emoji of each', async () => {
		const staging = { items: [{ id: '10', name: 'ban', animated: false }] };
		const production = { items: [{ id: '20', name: 'ban', animated: false }] };

		rest.get = async () => staging;
		await loadApplicationEmojis('staging');
		const forStaging = Emojis.Ban;

		rest.get = async () => production;
		await loadApplicationEmojis('production');

		expect(forStaging).toBe('<:ban:10>');
		expect(Emojis.Ban).toBe('<:ban:20>');
	});

	test('GIVEN what is missing THEN it is logged once, with its names', async () => {
		rest.get = async () => ({ items: [{ id: '1', name: 'ban', animated: false }] });
		await loadApplicationEmojis('1');

		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][0]).toContain('`greenTick`');
		expect(warn.mock.calls[0][0]).not.toContain('`ban`');
	});

	test('GIVEN Discord that cannot be asked THEN it does not throw and the emojis of before are written', async () => {
		rest.get = async () => {
			throw new Error('nope');
		};

		await expect(loadApplicationEmojis('1')).resolves.toBe(0);
		expect(Emojis.GreenTick).toBe('<:greenTick:1043562833905987685>');
	});

	test('GIVEN the variables of the texts THEN the emojis are read when a text is translated', async () => {
		const variables = parseInternationalizationDefaultVariables();
		const before = { ...variables }.GREENTICK;

		rest.get = async () => ({ items: [{ id: '777', name: 'greenTick', animated: false }] });
		await loadApplicationEmojis('1');

		expect(before).toBe('<:greenTick:1043562833905987685>');
		expect({ ...variables }.GREENTICK).toBe('<:greenTick:777>');
	});

	test('GIVEN every definition THEN its name is one Discord accepts for an emoji, and no name is used twice', () => {
		const names = Object.values(EmojiDefinitions).map((definition) => definition.name);

		expect(names.every((name) => /^\w{2,32}$/.test(name))).toBe(true);
		expect(new Set(names).size).toBe(names.length);
		expect(formatEmoji('a', '1', true)).toBe('<a:a:1>');
	});
});
