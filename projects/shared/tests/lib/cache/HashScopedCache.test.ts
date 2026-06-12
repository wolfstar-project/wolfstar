import type { APIEmoji, APIGuildMember } from 'discord-api-types/v10';
import { Cache } from '../../../src/lib/cache/Cache.js';
import { Emoji } from '../../../src/lib/cache/structures/Emoji.js';
import { Member } from '../../../src/lib/cache/structures/Member.js';

/**
 * Minimal in-memory stand-in for the subset of the ioredis hash API used by
 * {@link HashScopedCache}. Keeps the tests free of a live Redis instance.
 */
class FakeRedis {
	private readonly store = new Map<string, Map<string, Buffer>>();

	public async hgetBuffer(key: string, field: string): Promise<Buffer | null> {
		return this.store.get(key)?.get(field) ?? null;
	}

	public async hset(key: string, field: string, value: Buffer): Promise<number> {
		const existed = this.store.get(key)?.has(field) ?? false;
		this.bucket(key).set(field, value);
		return existed ? 0 : 1;
	}

	public async hmgetBuffer(key: string, ...fields: string[]): Promise<(Buffer | null)[]> {
		const bucket = this.store.get(key);
		return fields.map((field) => bucket?.get(field) ?? null);
	}

	public async hexists(key: string, field: string): Promise<number> {
		return this.store.get(key)?.has(field) ? 1 : 0;
	}

	public async hdel(key: string, ...fields: string[]): Promise<number> {
		const bucket = this.store.get(key);
		if (!bucket) return 0;
		let removed = 0;
		for (const field of fields) if (bucket.delete(field)) removed++;
		return removed;
	}

	private bucket(key: string): Map<string, Buffer> {
		let bucket = this.store.get(key);
		if (!bucket) {
			bucket = new Map();
			this.store.set(key, bucket);
		}

		return bucket;
	}
}

function createCache() {
	return new Cache({ client: new FakeRedis() as never, prefix: 's7' });
}

const guildId = '737141877803057244';

const emojiData: APIEmoji = {
	id: '298835537815175168',
	name: 'wolf',
	animated: true,
	available: true,
	managed: false,
	require_colons: true,
	roles: []
};

const memberData: APIGuildMember = {
	user: { id: '266624760782258186', username: 'Wolf', discriminator: '0001', global_name: null, avatar: null },
	nick: 'Original',
	avatar: null,
	roles: ['111111111111111111'],
	joined_at: '2019-02-03T21:57:10.354Z',
	premium_since: null,
	deaf: false,
	mute: false,
	flags: 0
};

describe('HashScopedCache.add', () => {
	it('constructs and stores a fresh entry on a cache miss', async () => {
		const cache = createCache();

		const value = await cache.emojis.add(guildId, emojiData);
		expect(value).toBeInstanceOf(Emoji);
		expect(value.name).toBe('wolf');

		const stored = await cache.emojis.get(guildId, BigInt(emojiData.id!));
		expect(stored?.name).toBe('wolf');
	});

	it('patches an existing entry without dropping untouched fields', async () => {
		const cache = createCache();
		await cache.emojis.add(guildId, emojiData);

		// Emoji has no bespoke patch, so this exercises the generic merge fallback.
		const patched = await cache.emojis.add(guildId, { id: emojiData.id, name: 'renamed' });
		expect(patched.name).toBe('renamed');
		expect(patched.animated).toBe(true);
		expect(patched.requireColons).toBe(true);
	});

	it('replaces the entry entirely when overwrite is true', async () => {
		const cache = createCache();
		await cache.emojis.add(guildId, emojiData);

		const overwritten = await cache.emojis.add(guildId, { id: emojiData.id, name: 'reset' }, true);
		expect(overwritten.name).toBe('reset');
		expect(overwritten.animated).toBeNull();
	});

	it('uses the structure-specific patch and id resolver for members', async () => {
		const cache = createCache();
		await cache.members.add(guildId, memberData);

		const updated = await cache.members.add(guildId, { ...memberData, nick: 'Renamed' });
		expect(updated.id).toBe(BigInt(memberData.user!.id));
		expect(updated.nickname).toBe('Renamed');
		// joined_at is preserved through the patch path.
		expect(updated.joinedAt).toBe(Date.parse(memberData.joined_at));
	});
});
