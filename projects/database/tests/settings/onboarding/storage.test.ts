import type { Database } from '../../../src/index.js';
import { createOnboardingStage, fetchOnboardingConfig, setOnboardingLogChannel, writeOnboarding } from '../../../src/settings/onboarding/storage.js';
import type { OnboardingStageInput } from '../../../src/settings/onboarding/types.js';

const Guild = '254360814063058944';

const stage: OnboardingStageInput = {
	name: 'Rules',
	enabled: true,
	trigger: 'Join',
	challenge: 'Button',
	question: null,
	answers: [],
	maxAttempts: 3,
	timeLimit: 600,
	roleId: null,
	failureAction: 'None',
	failureTimeout: null
};

interface State {
	onboarding: { id: bigint; revision: number; logChannelId: bigint | null } | null;
	stages: Record<string, unknown>[];
	reads: string[];
}

/**
 * A database that keeps the row of the onboarding and its stages in memory, and undoes a transaction that throws as
 * PostgreSQL would.
 */
function createDatabase(state: State) {
	const orm = {
		public: {
			Guild: { upsert: async () => undefined },
			Modules: { upsert: async () => undefined },
			GuildOnboarding: {
				upsert: async ({ create }: { create: { id: bigint } }) => {
					state.onboarding ??= { id: create.id, revision: 0, logChannelId: null };
				},
				first: async () => {
					state.reads.push('settings');
					return state.onboarding === null ? null : { enabled: false, channelId: null, messageId: null, ...state.onboarding };
				},
				where: (criteria: { revision?: number }) => ({
					updateAndCount: async (data: Partial<NonNullable<State['onboarding']>>) => {
						if (state.onboarding === null) return 0;
						if (criteria.revision !== undefined && criteria.revision !== state.onboarding.revision) return 0;
						Object.assign(state.onboarding, data);
						return 1;
					}
				})
			},
			GuildOnboardingStage: {
				where: () => ({
					orderBy: () => ({
						all: async () => {
							state.reads.push('stages');
							return state.stages;
						}
					})
				}),
				create: async (data: Record<string, unknown>) => {
					const row = { id: BigInt(state.stages.length + 1), createdAt: '2026-11-26 21:00:00.000', ...data };
					state.stages.push(row);
					return row;
				}
			}
		}
	};

	const db = {
		orm,
		transaction: async (run: (tx: unknown) => Promise<unknown>) => {
			const snapshot = structuredClone({ onboarding: state.onboarding, stages: state.stages });
			try {
				return await run({ orm });
			} catch (error) {
				state.onboarding = snapshot.onboarding;
				state.stages = snapshot.stages;
				throw error;
			}
		}
	};
	return db as unknown as Database;
}

function createState(revision: number | null): State {
	return { onboarding: revision === null ? null : { id: BigInt(Guild), revision, logChannelId: null }, stages: [], reads: [] };
}

describe('writeOnboarding', () => {
	test('GIVEN the revision the editor read THEN the write goes through and the revision grows by one', async () => {
		const state = createState(4);
		const result = await writeOnboarding(createDatabase(state), Guild, 4, setOnboardingLogChannel('1'));
		expect(result).toEqual({ ok: true, value: '1', revision: 5 });
		expect(state.onboarding).toMatchObject({ revision: 5, logChannelId: 1n });
	});

	test('GIVEN a stale revision THEN the write is refused and nothing is written', async () => {
		const state = createState(5);
		const result = await writeOnboarding(createDatabase(state), Guild, 4, createOnboardingStage(stage, false));
		expect(result).toEqual({ ok: false, error: { code: 'Conflict' } });
		expect(state.stages).toEqual([]);
		expect(state.onboarding?.revision).toBe(5);
	});

	test('GIVEN a guild with no row THEN the row is created at revision 0 and the first editor passes', async () => {
		const state = createState(null);
		const result = await writeOnboarding(createDatabase(state), Guild, 0, createOnboardingStage(stage, false));
		expect(result).toMatchObject({ ok: true, revision: 1, value: { name: 'Rules', position: 0 } });
		expect(state.onboarding?.revision).toBe(1);
	});

	test('GIVEN two editors that read the same revision THEN only the first one writes', async () => {
		const state = createState(2);
		const db = createDatabase(state);
		const first = await writeOnboarding(db, Guild, 2, createOnboardingStage(stage, false));
		const second = await writeOnboarding(db, Guild, 2, createOnboardingStage({ ...stage, name: 'Other' }, false));
		expect(first.ok).toBe(true);
		expect(second).toEqual({ ok: false, error: { code: 'Conflict' } });
		expect(state.stages).toHaveLength(1);
	});

	test('GIVEN an invalid stage THEN it is refused and the revision is undone', async () => {
		const state = createState(1);
		const result = await writeOnboarding(createDatabase(state), Guild, 1, createOnboardingStage({ ...stage, name: '' }, false));
		expect(result).toEqual({ ok: false, error: { code: 'Invalid', problems: ['NameLength'] } });
		expect(state.onboarding?.revision).toBe(1);
	});
});

describe('fetchOnboardingConfig', () => {
	test('GIVEN a guild THEN its revision is read before its stages', async () => {
		const state = createState(3);
		const config = await fetchOnboardingConfig(createDatabase(state).orm, Guild);
		expect(state.reads).toEqual(['settings', 'stages']);
		expect(config.settings.revision).toBe(3);
	});

	test('GIVEN a guild with no row THEN it reads at revision 0 and off', async () => {
		const config = await fetchOnboardingConfig(createDatabase(createState(null)).orm, Guild);
		expect(config.settings).toEqual({ enabled: false, logChannelId: null, channelId: null, messageId: null, revision: 0 });
	});
});
