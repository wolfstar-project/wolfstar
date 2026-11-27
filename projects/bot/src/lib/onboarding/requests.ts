import { getOnboardingFailureReason } from '#lib/onboarding/flow';
import { failOnboardingStageLocked, fetchOnboardingMember, passOnboardingStageLocked } from '#lib/onboarding/members';
import { readOnboardingConfig, withOnboardingMemberLock } from '#lib/onboarding/store';
import { leaseRequest } from '#utils/requestQueue';
import { container } from '@wolfstar/http-framework';
import {
	completeOnboardingRequest,
	fetchOnboardingVerification,
	fetchPendingOnboardingRequestIds,
	fetchUnprocessedOnboardingRequest,
	type OnboardingRequest
} from 'wolfstar-database';

/**
 * Why a member who passed the captcha on the website could not be passed, which the website reads from the row as
 * `<code>: <detail>`: a contract with wolfstar.rocks.
 */
export type OnboardingRequestFailureCode = 'off' | 'notMember' | 'stale' | 'expired' | 'roleRefused' | 'failed';

/**
 * How old a request nobody claimed is before a sweep takes it, in milliseconds: a newer one is left to its notification.
 */
const OnboardingSweepDelay = 5000;

/**
 * How many requests a sweep takes at most.
 */
const SweepLimit = 50;

const FailureDetails: Readonly<Record<OnboardingRequestFailureCode, string>> = {
	off: 'The onboarding of this server is off.',
	notMember: 'This user is not a member of the server.',
	stale: 'The member no longer waits at this Captcha stage.',
	expired: 'The time of this stage ran out.',
	roleRefused: 'Discord refused the role of this stage, the member still waits.',
	failed: 'Something went wrong, it was logged.'
};

/**
 * Passes the member of a request, under the lock of the member, as the button of the verification message does: the
 * row the website read must still wait, at an enabled `Captcha` stage, in time.
 *
 * @returns Why it could not be done, `null` when it was.
 */
async function runOnboardingRequest(request: OnboardingRequest): Promise<OnboardingRequestFailureCode | null> {
	const { guildId, userId } = request;
	const config = await readOnboardingConfig(guildId);
	if (!config.settings.enabled) return 'off';

	const member = await fetchOnboardingMember(guildId, userId);
	if (member === null) return 'notMember';

	return withOnboardingMemberLock(guildId, userId, async () => {
		const verification = await fetchOnboardingVerification(container.prisma.orm, request.verificationId);
		if (verification === null || verification.guildId !== guildId || verification.userId !== userId || verification.status !== 'Waiting') {
			return 'stale';
		}

		const stage = config.stages.find((entry) => entry.id === verification.stageId);
		if (stage === undefined || !stage.enabled || stage.challenge !== 'Captcha') return 'stale';

		const failure = getOnboardingFailureReason(stage, verification, Date.now());
		if (failure !== null) {
			const guild = await container.gatewayClient.guilds.fetch(guildId);
			await failOnboardingStageLocked(guild, config, stage, verification, failure);
			return 'expired';
		}

		const result = await passOnboardingStageLocked(member, config, stage, verification);
		if (result.kind === 'Stale') return 'stale';
		if (result.kind === 'RoleRefused') return 'roleRefused';
		return null;
	});
}

/**
 * Handles a request of the website once, whatever brought it (its notification, a sweep, another process), as the
 * requests of the appeals are: leased, read again while it is not done, done, and marked done with why it could not be.
 * A member passed twice cannot happen: only a row that still waits is passed, under the lock of the member.
 *
 * @param requestId - The ID of the request.
 * @returns `Claimed` when another handler has it, or had it done.
 */
export async function handleOnboardingRequest(requestId: string): Promise<'Claimed' | 'Done' | 'Failed'> {
	const release = await leaseRequest(`wolfstar:onboarding:request:${requestId}`, '[Onboarding]');
	if (release === null) return 'Claimed';

	try {
		const request = await fetchUnprocessedOnboardingRequest(container.prisma, requestId);
		if (request === null) return 'Claimed';

		let failure: OnboardingRequestFailureCode | null;
		try {
			failure = await runOnboardingRequest(request);
		} catch (error) {
			container.logger.error(`[Onboarding] Could not handle the request ${requestId}:`, error);
			failure = 'failed';
		}

		container.logger.debug(`[Onboarding] The request ${requestId} of ${request.guildId}: ${failure ?? 'done'}`);
		await completeOnboardingRequest(container.prisma, requestId, failure === null ? null : `${failure}: ${FailureDetails[failure]}`);
		return failure === null ? 'Done' : 'Failed';
	} finally {
		await release();
	}
}

/**
 * Reads the requests a sweep takes: the ones nobody claimed for {@linkcode OnboardingSweepDelay}, whose notification
 * was lost or came while the bot was not listening.
 */
export function fetchOnboardingRequestsToSweep(now = Date.now()): Promise<string[]> {
	return fetchPendingOnboardingRequestIds(container.prisma, now - OnboardingSweepDelay, SweepLimit);
}
