import { container } from '@wolfstar/http-framework';
import { seconds } from 'wolfstar-shared';

/**
 * What this process claimed, and when each claim ends, see {@linkcode claimOnce}.
 */
const localClaims = new Map<string, number>();

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
 * @returns Whether it was not claimed yet, which is when to do what it is for.
 */
export async function claimOnce(key: string, duration: number): Promise<boolean> {
	if (isClaimedLocally(key)) return false;

	const { redis } = container;
	if (redis?.status === 'ready') {
		try {
			const claimed = (await redis.set(`wolfstar:claims:${key}`, '1', 'EX', duration, 'NX')) !== null;
			if (claimed) claimLocally(key, duration);
			return claimed;
		} catch (error) {
			container.logger.error(`[Claims] Could not claim ${key} in Redis:`, error);
		}
	}

	// Another call may have claimed it here while Redis was asked and failed:
	if (isClaimedLocally(key)) return false;
	claimLocally(key, duration);
	return true;
}

/**
 * Releases a claim before it ends, for when what it was for could not be done after all, so the next one gets it.
 *
 * @param key - What was claimed.
 */
export async function releaseClaim(key: string): Promise<void> {
	localClaims.delete(key);

	const { redis } = container;
	if (redis?.status !== 'ready') return;
	try {
		await redis.del(`wolfstar:claims:${key}`);
	} catch (error) {
		container.logger.error(`[Claims] Could not release ${key} in Redis:`, error);
	}
}

function isClaimedLocally(key: string): boolean {
	const now = Date.now();
	// The claims that ended are dropped here, so the map only holds what is still claimed:
	for (const [claimed, expiresAt] of localClaims) {
		if (expiresAt <= now) localClaims.delete(claimed);
	}

	return localClaims.has(key);
}

function claimLocally(key: string, duration: number): void {
	localClaims.set(key, Date.now() + seconds(duration));
}
