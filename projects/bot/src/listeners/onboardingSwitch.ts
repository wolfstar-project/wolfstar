import { resumeOnboardingTimeLimits } from '#lib/onboarding/members';
import { Events } from '#lib/types/Enums';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * Gives the members who wait their time limit again when a write of the bot switches the onboarding on: the panel,
 * `/conf`, the settings menu or an import. See `resumeOnboardingTimeLimits`.
 */
@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.OnboardingSwitch })
export class UserListener extends Listener {
	public run(guildId: Snowflake, previous: boolean, next: boolean) {
		return resumeOnboardingTimeLimits(guildId, previous, next);
	}
}
