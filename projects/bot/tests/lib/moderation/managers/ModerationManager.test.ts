import { ModerationManager } from '#lib/moderation/managers/ModerationManager';
import { toModerationRow } from '#lib/moderation/managers/ModerationRecord';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';
import { seconds } from 'wolfstar-shared';

/**
 * The Redis commands the locks use, of a sorted set kept in memory, so the managers of two "processes" can share it.
 */
function createFakeRedis() {
	const sets = new Map<string, Map<string, number>>();
	const set = (key: string) => {
		let value = sets.get(key);
		if (value === undefined) sets.set(key, (value = new Map()));
		return value;
	};

	return {
		status: 'ready',
		sets,
		zadd: vi.fn(async (key: string, score: number, member: string) => {
			set(key).set(member, score);
			return 1;
		}),
		zrem: vi.fn(async (key: string, member: string) => Number(set(key).delete(member))),
		zremrangebyscore: vi.fn(async (key: string, _min: string, max: number) => {
			let removed = 0;
			for (const [member, score] of set(key)) {
				if (score <= max && set(key).delete(member)) removed++;
			}

			return removed;
		}),
		zcard: vi.fn(async (key: string) => set(key).size)
	};
}

describe('ModerationManager across processes', () => {
	const guild = { id: '541738403230777351' } as unknown as Guild;
	const userId = '266624760782258186';
	const moderatorId = '254360814063058944';
	const previous = { prisma: (container as any).prisma, redis: (container as any).redis };

	let rows: ReturnType<typeof toModerationRow>[] = [];
	let redis = createFakeRedis();

	function row(type: TypeVariation, ago: number, id = rows.length + 1) {
		return toModerationRow({
			id,
			createdAt: Date.now() - ago,
			duration: null,
			guildId: guild.id,
			moderatorId,
			userId,
			reason: null,
			type,
			metadata: TypeMetadata.None
		});
	}

	beforeEach(() => {
		rows = [];
		redis = createFakeRedis();
		(container as any).redis = redis;
		(container as any).prisma = {
			orm: {
				public: {
					ModerationAction: {
						where: vi.fn(() => ({ orderBy: () => ({ limit: () => ({ all: async () => rows }) }) }))
					}
				}
			}
		};
	});

	afterAll(() => {
		(container as any).prisma = previous.prisma;
		(container as any).redis = previous.redis;
	});

	describe('the latest recent case of a user', () => {
		test('GIVEN a kick another process made a moment ago WHEN this process has not cached it THEN it is read from the database', async () => {
			rows = [row(TypeVariation.Kick, seconds(3))];

			const entry = await new ModerationManager(guild).fetchLatestRecentEntryForUser(userId);

			expect(entry?.type).toBe(TypeVariation.Kick);
		});

		test('GIVEN the latest case is older than 30 seconds THEN it is not recent', async () => {
			rows = [row(TypeVariation.Kick, seconds(45))];

			await expect(new ModerationManager(guild).fetchLatestRecentEntryForUser(userId)).resolves.toBeNull();
		});

		test('GIVEN a user with no case THEN there is none', async () => {
			await expect(new ModerationManager(guild).fetchLatestRecentEntryForUser(userId)).resolves.toBeNull();
		});
	});

	describe('a similar case made in the last minute', () => {
		test('GIVEN a ban another process made a moment ago THEN a ban is a duplicate', async () => {
			rows = [row(TypeVariation.Ban, seconds(10))];

			await expect(new ModerationManager(guild).hasSimilarEntryBeenCreated(TypeVariation.Ban, userId)).resolves.toBe(true);
		});

		test('GIVEN a softban another process made a moment ago THEN a ban is a duplicate', async () => {
			rows = [row(TypeVariation.Softban, seconds(10))];

			await expect(new ModerationManager(guild).hasSimilarEntryBeenCreated(TypeVariation.Ban, userId)).resolves.toBe(true);
		});

		test('GIVEN a kick THEN a ban is not a duplicate', async () => {
			rows = [row(TypeVariation.Kick, seconds(10))];

			await expect(new ModerationManager(guild).hasSimilarEntryBeenCreated(TypeVariation.Ban, userId)).resolves.toBe(false);
		});

		test('GIVEN a ban of more than a minute ago THEN a ban is not a duplicate', async () => {
			rows = [row(TypeVariation.Ban, seconds(90))];

			await expect(new ModerationManager(guild).hasSimilarEntryBeenCreated(TypeVariation.Ban, userId)).resolves.toBe(false);
		});
	});

	describe('the lock of a moderation action', () => {
		const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

		test('GIVEN a command running in another process WHEN this process waits THEN it waits until the command is done', async () => {
			const gateway = new ModerationManager(guild);
			const worker = new ModerationManager(guild);
			const unlock = gateway.createLock();
			await settle(10);

			let waited = false;
			const waiting = worker.waitLock().then(() => (waited = true));
			await settle();
			expect(waited).toBe(false);

			unlock();
			await waiting;
			expect(waited).toBe(true);
			expect(redis.sets.get(`wolfstar:moderation-locks:${guild.id}`)?.size ?? 0).toBe(0);
		});

		test('GIVEN a lock of a process that died WHEN its time is over THEN it is not waited for', async () => {
			redis.sets.set(`wolfstar:moderation-locks:${guild.id}`, new Map([['dead', Date.now() - 1]]));

			await expect(new ModerationManager(guild).waitLock()).resolves.toBeUndefined();
		});

		test('GIVEN a lock of this process THEN the waiters of this process wait for it too', async () => {
			const manager = new ModerationManager(guild);
			const unlock = manager.createLock();

			let waited = false;
			const waiting = manager.waitLock().then(() => (waited = true));
			await settle(50);
			expect(waited).toBe(false);

			unlock();
			await waiting;
			expect(waited).toBe(true);
		});

		test('GIVEN no Redis THEN only the locks of this process are waited for', async () => {
			(container as any).redis = null;
			const manager = new ModerationManager(guild);
			const unlock = manager.createLock();

			let waited = false;
			const waiting = manager.waitLock().then(() => (waited = true));
			await settle(50);
			expect(waited).toBe(false);

			unlock();
			await waiting;
			expect(waited).toBe(true);
			expect(redis.zadd).not.toHaveBeenCalled();
		});
	});
});
