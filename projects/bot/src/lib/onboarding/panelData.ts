import { fetchOnboardingReadinessContext } from '#lib/onboarding/discord';
import type { OnboardingPanelContext } from '#lib/onboarding/panel';
import type { Translator } from '#lib/structures/commands/utils';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import { days } from 'wolfstar-shared';
import { countOnboardingVerifications, fetchOnboardingConfig } from 'wolfstar-database';

/**
 * What the panel shows, read anew: the onboarding from the database (the revision before the stages), its readiness
 * from Discord, and the counts of the last seven days.
 */
export type LoadedOnboardingPanel = Omit<OnboardingPanelContext, 'notice'>;

/**
 * Reads what the panel of a guild shows.
 *
 * @param guildId - The guild.
 * @param ownerId - The administrator who opened the panel.
 * @param t - The function to translate with, in their language.
 */
export async function loadOnboardingPanel(guildId: Snowflake, ownerId: Snowflake, t: Translator): Promise<LoadedOnboardingPanel> {
	const { orm } = container.prisma;
	// The revision is read before the stages, one after the other, so the panel never pairs stale stages with it:
	const config = await fetchOnboardingConfig(orm, guildId);
	const [readiness, counts] = await Promise.all([
		fetchOnboardingReadinessContext(guildId, config.settings),
		countOnboardingVerifications(orm, guildId, Date.now() - days(7))
	]);
	return { t, ownerId, config, readiness, counts };
}
