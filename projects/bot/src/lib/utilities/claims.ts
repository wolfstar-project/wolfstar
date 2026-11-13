import { container } from '@wolfstar/http-framework';
import { randomUUID } from 'node:crypto';
import { seconds } from 'wolfstar-shared';

/**
 * What this process claimed: the token of each claim and when it ends, see {@linkcode claim}.
 */
const localClaims = new Map<string, { readonly token: string; readonly expiresAt: number }>();

/**
 * Deletes a claim in Redis only when it still holds the token given, in one step: a claim that ended and was taken
 * again by somebody else is theirs, and stays.
 */
const ReleaseScript = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

/**
 * Claims something for a while, so that what is done once for it is not done again until the claim ends: a reply to a
 * member who sends the same thing over and over, for example.
 *
 * @remarks
 *
 * The claim is in Redis (`wolfstar:claims:<key>`), so it holds across the shards and the workers, and this process
 * remembers it as well, so a connection that drops or comes back meanwhile does not let a second claim through. Without
 * a connection, or when Redis fails, the claim is kept by this process alone: a burst is still answered once here,
 * which is all a single process needs, and the most that can be done when the connection is down.
 *
 * @param key - What is claimed, e.g. `automod-alert:<guildId>:<channelId>:<userId>`.
 * @param duration - For how many seconds nobody else can claim it.
 * @returns The token of the claim, to release it with {@linkcode releaseClaim}, or `null` when it was claimed already.
 */
export async function claim(key: string, duration: number): Promise<string | null> {
	if (isClaimedLocally(key)) return null;

	const token = randomUUID();
	const { redis } = container;
	if (redis?.status === 'ready') {
		try {
			const claimed = (await redis.set(`wolfstar:claims:${key}`, token, 'EX', duration, 'NX')) !== null;
			if (!claimed) return null;
			claimLocally(key, token, duration);
			return token;
		} catch (error) {
			container.logger.error(`[Claims] Could not claim ${key} in Redis:`, error);
		}
	}

	// Another call may have claimed it here while Redis was asked and failed:
	if (isClaimedLocally(key)) return null;
	claimLocally(key, token, duration);
	return token;
}

/**
 * Claims something for a while, for what is never released, see {@linkcode claim}.
 *
 * @returns Whether it was not claimed yet, which is when to do what it is for.
 */
export async function claimOnce(key: string, duration: number): Promise<boolean> {
	return (await claim(key, duration)) !== null;
}

/**
 * Releases a claim before it ends, for when what it was for could not be done after all, so the next one gets it. Only
 * the claim of the token is released: when it ended meanwhile and was claimed again, the new claim stays.
 *
 * @param key - What was claimed.
 * @param token - The token {@linkcode claim} gave.
 */
export async function releaseClaim(key: string, token: string): Promise<void> {
	if (localClaims.get(key)?.token === token) localClaims.delete(key);

	const { redis } = container;
	if (redis?.status !== 'ready') return;
	try {
		await redis.eval(ReleaseScript, 1, `wolfstar:claims:${key}`, token);
	} catch (error) {
		container.logger.error(`[Claims] Could not release ${key} in Redis:`, error);
	}
}

function isClaimedLocally(key: string): boolean {
	const now = Date.now();
	// The claims that ended are dropped here, so the map only holds what is still claimed:
	for (const [claimed, { expiresAt }] of localClaims) {
		if (expiresAt <= now) localClaims.delete(claimed);
	}

	return localClaims.has(key);
}

function claimLocally(key: string, token: string, duration: number): void {
	localClaims.set(key, { token, expiresAt: Date.now() + seconds(duration) });
}
