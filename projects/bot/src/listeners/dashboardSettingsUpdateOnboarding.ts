import { syncOnboardingTimeLimits } from '#lib/onboarding/members';
import { Events } from '#lib/types';
import { getLogPrefix } from '#utils/functions';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The key the dashboard names when it writes the stages of the onboarding, which are rows and not keys of the settings.
 */
const OnboardingDashboardKey = 'onboarding';

/**
 * Makes the time limits the dashboard saved apply to the members who wait, see `syncOnboardingTimeLimits`: a limit made
 * shorter, or added, acts at once, and the rows of a stage it deleted stop waiting.
 */
@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.DashboardSettingsUpdate })
export class UserListener extends Listener {
	public async run(guildId: Snowflake, keys: readonly string[]) {
		if (!keys.includes(OnboardingDashboardKey)) return;

		try {
			const { scheduled, left } = await syncOnboardingTimeLimits(guildId);
			this.container.logger.debug(
				`[Onboarding] The dashboard wrote the stages of ${guildId}: ${scheduled} time limits scheduled, ${left} rows left`
			);
		} catch (error) {
			this.container.logger.error(`${getLogPrefix(this)} Could not apply the time limits of ${guildId} to the members who wait:`, error);
		}
	}
}
