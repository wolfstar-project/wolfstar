import { container } from '@wolfstar/http-framework';
import { seconds } from 'wolfstar-shared';

/**
 * What this process claimed while Redis could not be asked, and when each claim ends, see {@linkcode claimOnce}.
 */
const localClaims = new Map<string, number>();

/**
 * Claims something for a while, so that what is done once for it is not done again until the claim ends: a reply to a
 * member who sends the same thing over and over, for example.
 *
 * @remarks
 *
 * The claim is in Redis (`wolfstar:claims:<key>`), so it holds across the shards and the workers. Without a connection,
 * or when Redis fails, the claim is kept by this process: a burst is still answered once here, which is all a single
 * process needs, and the most that can be done when the connection is down.
 *
 * @param key - What is claimed, e.g. `automod-alert:<guildId>:<channelId>:<userId>`.
 * @param duration - For how many seconds nobody else can claim it.
 * @returns Whether it was not claimed yet, which is when to do what it is for.
 */
export async function claimOnce(key: string, duration: number): Promise<boolean> {
	const { redis } = container;
	if (redis?.status === 'ready') {
		try {
			return (await redis.set(`wolfstar:claims:${key}`, '1', 'EX', duration, 'NX')) !== null;
		} catch (error) {
			container.logger.error(`[Claims] Could not claim ${key} in Redis:`, error);
		}
	}

	return claimLocally(key, duration);
}

function claimLocally(key: string, duration: number): boolean {
	const now = Date.now();
	// The claims that ended are dropped here, so the map only holds what is still claimed:
	for (const [claimed, expiresAt] of localClaims) {
		if (expiresAt <= now) localClaims.delete(claimed);
	}

	if (localClaims.has(key)) return false;

	localClaims.set(key, now + seconds(duration));
	return true;
}
