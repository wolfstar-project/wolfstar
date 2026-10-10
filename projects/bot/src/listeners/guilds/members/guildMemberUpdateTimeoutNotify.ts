import { readSettings } from '#lib/database';
import { ModerationActions } from '#lib/moderation';
import { getLogger, getModeration } from '#utils/functions';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import { isNumber } from '@sapphire/utilities';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';

@RegisterAsGatewayListener('guildMemberUpdate')
export class UserListener extends EventGatewayListener<'guildMemberUpdate'> {
	public async run(previous: GuildMember | null, next: GuildMember) {
		const prevTimeout = this.#getTimeout(previous);
		const nextTimeout = this.#getTimeout(next);
		if (prevTimeout === nextTimeout) return;

		const user = next.user ?? (await next.fetchUser());
		const guild = next.guild ?? (await next.fetchGuild());
		const logger = await getLogger(guild);

		// If the action was done by Wolf, skip:
		const actionByWolf = logger.timeout.isSet(user.id);
		if (actionByWolf) return;

		const controller = new AbortController();
		const contextPromise = logger.timeout.wait(user.id, controller.signal);

		// If the guild doesn't have manual logging enabled, skip:
		const settings = await readSettings(guild);
		const manualLoggingEnabled = settings.moderationTrackTimeouts;
		if (!manualLoggingEnabled) {
			controller.abort();
			return;
		}

		const context = await contextPromise;
		const moderation = await getModeration(guild);

		const duration = this.#getDuration(nextTimeout);
		const entry = moderation.create({
			user,
			moderator: context?.userId,
			type: TypeVariation.Timeout,
			metadata: duration ? TypeMetadata.Temporary : TypeMetadata.Undo,
			duration,
			reason: context?.reason
		});
		await moderation.insert(entry);
		await ModerationActions.timeout.completeLastModerationEntryFromUser({ guild, userId: user.id });
	}

	/**
	 * Gets the timestamp the timeout of a member ends at, `null` when they are not timed out, or when the member is
	 * not known (the previous state of a member that was not cached).
	 */
	#getTimeout(member: GuildMember | null) {
		if (member === null) return null;

		const timeout = member.communicationDisabledUntilTimestamp;
		return isNumber(timeout) && timeout >= Date.now() ? timeout : null;
	}

	#getDuration(timeout: number | null) {
		if (timeout === null) return null;

		const now = Date.now();
		return timeout > now ? timeout - now : null;
	}
}
