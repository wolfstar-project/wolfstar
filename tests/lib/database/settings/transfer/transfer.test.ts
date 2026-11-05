import type { ReadonlyGuildData } from '#lib/database/settings/types';
import { getDefaultGuildSettings } from '#lib/database/settings/constants';
import { getConfigurableGroups, SerializerStore } from '#lib/database/settings';
import { getColumnLimit } from '#lib/database/settings/transfer/columns';
import { createConfigurationFile, getPortableKeys } from '#lib/database/settings/transfer/format';
import { parseConfigurationFile } from '#lib/database/settings/transfer/parse';
import { getPlannedSettings, planConfigurationImport } from '#lib/database/settings/transfer/plan';
import { UserSerializer as StringSerializer } from '../../../../../src/serializers/string';
import { UserSerializer as NumberSerializer } from '../../../../../src/serializers/number';
import { UserSerializer as TimespanSerializer } from '../../../../../src/serializers/timespan';
import { UserSerializer as LanguageSerializer } from '../../../../../src/serializers/language';
import { UserSerializer as CommandSerializer } from '../../../../../src/serializers/commandmatch';
import { UserSerializer as BooleanSerializer } from '../../../../../src/serializers/boolean';
import { container } from '@sapphire/framework';
import type { TFunction } from '@sapphire/plugin-i18next';
import { createGuild } from '../../../../mocks/MockInstances';
import { readFileSync } from 'node:fs';

const guild = createGuild();
const settings = { ...getDefaultGuildSettings(), id: guild.id } as ReadonlyGuildData;
const t = ((key: string) => key) as TFunction;
const context = { guild, settings, t };

beforeAll(() => {
	const store = new SerializerStore();
	container.stores.register(store);
	for (const [name, Constructor] of [
		['string', StringSerializer],
		['integer', NumberSerializer],
		['boolean', BooleanSerializer],
		['timespan', TimespanSerializer],
		['language', LanguageSerializer],
		['commandmatch', CommandSerializer]
	] as const) {
		store.set(name, new Constructor({ name, root: process.cwd(), path: `${name}.ts`, store }, { name }));
	}
});

it('exports legacy settings as version 1 without server IDs', () => {
	const file = JSON.parse(
		JSON.stringify(
			createConfigurationFile({ ...settings, prefix: '?', channelsUpdates: '123', rolesMuted: '456', selfmodFilterRaw: ['badword'] })
		)
	);
	expect(file.version).toBe(1);
	expect(file.settings.prefix).toBe('?');
	expect(file.settings['selfmod.filter.raw']).toEqual(['badword']);
	expect(file.settings['channels.updates']).toBeUndefined();
	expect(file.settings['roles.muted']).toBeUndefined();
	expect(file.settings.id).toBeUndefined();
});

it('imports a partial file without resetting server-specific or omitted settings', async () => {
	const result = await parseConfigurationFile(
		JSON.stringify({ version: 1, settings: { prefix: '?', 'selfmod.filter.raw': ['one', 'one', 'two'] } }),
		context
	);
	if (!result.ok) throw new Error(JSON.stringify(result.issues));
	const updated = { ...settings, ...getPlannedSettings(planConfigurationImport(settings, result.value)) };
	expect(updated.prefix).toBe('?');
	expect(updated.selfmodFilterRaw).toEqual(['one', 'two']);
	expect(updated.channelsLogsModeration).toBe(settings.channelsLogsModeration);
	expect(updated.language).toBe(settings.language);
	expect(planConfigurationImport(updated, result.value)).toEqual([]);
});

it.each([
	['invalid JSON', '{'],
	['future version', JSON.stringify({ version: 2, settings: {} })],
	['missing version', JSON.stringify({ settings: {} })],
	['non-object', '[]'],
	['server-specific setting', JSON.stringify({ version: 1, settings: { 'channels.updates': '123' } })],
	['unknown section', JSON.stringify({ version: 1, automod: { rules: [] } })],
	['wrong scalar type', JSON.stringify({ version: 1, settings: { prefix: 4 } })],
	['too long prefix', JSON.stringify({ version: 1, settings: { prefix: '12345678901' } })],
	['number outside range', JSON.stringify({ version: 1, settings: { 'selfmod.messages.maximum': 101 } })],
	['fractional integer', JSON.stringify({ version: 1, settings: { 'selfmod.messages.maximum': 5.5 } })],
	['wrong boolean type', JSON.stringify({ version: 1, settings: { 'selfmod.messages.enabled': 'false' } })],
	['wrong array type', JSON.stringify({ version: 1, settings: { 'selfmod.filter.raw': 'word' } })]
])('rejects %s', async (_, text) => {
	expect((await parseConfigurationFile(text, context)).ok).toBe(false);
});

it('accepts a UTF-8 BOM and validates numeric bounds', async () => {
	const result = await parseConfigurationFile('\uFEFF' + JSON.stringify({ version: 1, settings: { 'selfmod.messages.maximum': 100 } }), context);
	if (!result.ok) throw new Error(JSON.stringify(result.issues));
	expect(getPlannedSettings(planConfigurationImport(settings, result.value))).toEqual({ selfmodMessagesMaximum: 100 });
});

it('resolves the old channel-logs name to the configurable announcements channel', () => {
	const key = getConfigurableGroups().getPathString('channel-logs');
	expect(key?.name).toBe('channels.updates');
});

it('can restore a complete exported configuration, including Prisma BigInt durations', async () => {
	vi.spyOn(container.i18n.languages, 'has').mockReturnValue(true);
	const source = { ...settings, selfmodAttachmentsHardActionDuration: 60000n };
	try {
		const file = JSON.stringify(createConfigurationFile(source));
		const result = await parseConfigurationFile(file, { ...context, settings: source });
		if (!result.ok) throw new Error(JSON.stringify(result.issues));
		expect(planConfigurationImport(source, result.value)).toEqual([]);
		const plan = planConfigurationImport({ ...source, selfmodAttachmentsHardActionDuration: 1000n }, result.value);
		expect(JSON.parse(JSON.stringify(plan))).toEqual([
			{ name: 'selfmod.attachments.hard-action-duration', property: 'selfmodAttachmentsHardActionDuration', before: 1000, after: 60000 }
		]);
	} finally {
		vi.restoreAllMocks();
	}
});

describe('the limits of the columns', () => {
	const issuesOf = async (values: Record<string, unknown>) => {
		const result = await parseConfigurationFile(JSON.stringify({ version: 1, settings: values }), context);
		return result.ok ? [] : result.issues;
	};

	it('refuses a value longer than its column, instead of failing once the import is confirmed', async () => {
		expect(await issuesOf({ 'selfmod.filter.raw': ['x'.repeat(33)] })).toEqual([
			{ path: 'settings.selfmod.filter.raw', message: 'commands/conf:transferErrorTooLong' }
		]);
		expect(await issuesOf({ 'selfmod.filter.raw': ['x'.repeat(32)] })).toEqual([]);
	});

	it('refuses a number its column cannot hold, even when the setting allows it', async () => {
		// The setting allows five years, the column is a 32-bit integer:
		expect(await issuesOf({ 'selfmod.attachments.threshold-duration': 157_680_000_000 })).toEqual([
			{ path: 'settings.selfmod.attachments.threshold-duration', message: 'commands/conf:transferErrorOutOfRange' }
		]);
	});

	it('refuses words that do not make a filter, which would break it once saved', async () => {
		expect(await issuesOf({ 'selfmod.filter.raw': ['[z-a]'] })).toEqual([
			{ path: 'settings.selfmod.filter.raw', message: 'commands/conf:transferErrorWordFilter' }
		]);
		expect(await issuesOf({ 'selfmod.filter.raw': ['bad', '[ab]c'] })).toEqual([]);
	});

	it('knows the limit of the column of every setting of the file, as the schema has it', () => {
		const schema = readFileSync('prisma/schema.prisma', 'utf8');
		const model = schema.slice(schema.indexOf('model Guild {'));
		const columns = new Map<string, string>();
		for (const line of model.slice(0, model.indexOf('\n}')).split('\n')) {
			const match = /^\s+(\w+)\s+(\w+)(\[\])?\??\s(.*)$/.exec(line);
			if (match) columns.set(match[1], `${match[2]} ${/@db\.(\w+(?:\(\d+\))?)/.exec(match[4])?.[1] ?? ''}`.trim());
		}

		const expected = (column: string) => {
			const length = /VarChar\((\d+)\)/.exec(column);
			if (length) return { kind: 'text', maximum: Number(length[1]) };
			if (column === 'Int SmallInt') return { kind: 'number', minimum: -32_768, maximum: 32_767 };
			if (column === 'Int') return { kind: 'number', minimum: -2_147_483_648, maximum: 2_147_483_647 };
			return null;
		};

		for (const key of getPortableKeys()) {
			const column = columns.get(key.property);
			expect([key.property, column]).not.toContain(undefined);
			expect([key.property, getColumnLimit(key)]).toEqual([key.property, expected(column!)]);
		}
	});
});
