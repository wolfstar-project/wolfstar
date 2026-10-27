import type { JoinGuardRule } from 'wolfstar-database';

export const guildId = '254360814063058944';

/**
 * A rule that matches nobody and does nothing, for a test to set what it looks at.
 */
export function createRule(overrides: Partial<JoinGuardRule> = {}): JoinGuardRule {
	return {
		id: '1',
		guildId,
		name: 'New accounts',
		enabled: true,
		accountAgeMax: null,
		defaultAvatar: false,
		generatedName: false,
		nameContains: null,
		unverifiedBot: false,
		sendToCheckpoint: false,
		roleId: null,
		directMessage: false,
		alertChannelId: null,
		hardAction: null,
		createdAt: 0,
		...overrides
	};
}
