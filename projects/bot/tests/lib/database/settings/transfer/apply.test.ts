import { applyConfigurationImport, ConfigurationImportStaleError } from '#lib/database/settings/transfer/apply';
import type { ParsedConfiguration } from '#lib/database/settings/transfer/parse';
import {
	getDefaultAutoModerationRule,
	getDefaultGuildSettings,
	MaximumAutoModerationRuleListLength,
	type AutoModerationRule,
	type ReadonlyGuildData
} from 'wolfstar-database';

const guildId = '254360814063058944';

const mocks = vi.hoisted(() => ({
	events: [] as string[],
	settings: null as ReadonlyGuildData | null
}));

vi.mock('#lib/database/settings/functions', () => ({
	readSettingsAuditLog: () => ({ update: async () => undefined }),
	// A transaction that only records when its lock is released:
	writeSettingsTransaction: async () => {
		mocks.events.push('settings locked');
		let locking = true;
		const unlock = () => {
			if (locking) mocks.events.push('settings unlocked');
			locking = false;
		};

		return {
			settings: mocks.settings,
			write: () => undefined,
			submit: async (alongside?: (tx: unknown) => Promise<void>) => {
				mocks.events.push('written');
				await alongside?.({});
				unlock();
			},
			[Symbol.dispose]: unlock
		};
	}
}));

vi.mock('#lib/moderation/automod/rules', () => ({
	announceAutoModerationRulesChange: () => undefined,
	// The lock of the rules is waited for, as it is when another write of the rules is running:
	writeAutoModerationRules: async (_: string, callback: (rules: readonly AutoModerationRule[]) => Promise<unknown>) => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		mocks.events.push('rules locked');
		try {
			return await callback([]);
		} finally {
			mocks.events.push('rules unlocked');
		}
	}
}));

function createParsed(value: boolean): ParsedConfiguration {
	return { settings: [{ key: { property: 'modulesLogs' } as never, value }], rules: null };
}

describe('applyConfigurationImport', () => {
	beforeEach(() => {
		mocks.events.length = 0;
		mocks.settings = { ...getDefaultGuildSettings(), id: guildId, modulesLogs: true } as ReadonlyGuildData;
	});

	test('GIVEN a file that changes nothing THEN the lock of the settings is held until the rules were read', async () => {
		const plan = await applyConfigurationImport(guildId, createParsed(true), '1');

		expect(plan.isEmpty).toBe(true);
		expect(mocks.events).toEqual(['settings locked', 'rules locked', 'rules unlocked', 'settings unlocked']);
	});

	test('GIVEN a file that changes a setting THEN it is written under both locks', async () => {
		const plan = await applyConfigurationImport(guildId, createParsed(false), '1');

		expect(plan.settings).toHaveLength(1);
		expect(mocks.events).toEqual(['settings locked', 'rules locked', 'written', 'settings unlocked', 'rules unlocked']);
	});

	test('GIVEN a list the server no longer allows THEN nothing is written and the locks are released', async () => {
		const words = Array.from({ length: MaximumAutoModerationRuleListLength + 1 }, (_, index) => `word${index}`);
		const { ignoredRoles: _roles, ignoredChannels: _channels, ...rule } = getDefaultAutoModerationRule('Words');
		const parsed: ParsedConfiguration = { settings: [], rules: [{ ...rule, name: 'Words', options: { words } }] };

		// The server has no rule to allow the list by, as when the rule was deleted after the file was read:
		await expect(applyConfigurationImport(guildId, parsed, '1')).rejects.toBeInstanceOf(ConfigurationImportStaleError);
		expect(mocks.events).toEqual(['settings locked', 'rules locked', 'rules unlocked', 'settings unlocked']);
	});
});
