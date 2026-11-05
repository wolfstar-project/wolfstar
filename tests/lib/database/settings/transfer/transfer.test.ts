import type { ReadonlyGuildData } from '#lib/database/settings/types';
import { getDefaultGuildSettings } from '#lib/database/settings/constants';
import { getConfigurableGroups, SerializerStore } from '#lib/database/settings';
import { createConfigurationFile } from '#lib/database/settings/transfer/format';
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
