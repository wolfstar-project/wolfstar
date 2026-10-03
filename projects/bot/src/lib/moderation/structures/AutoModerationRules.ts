import type { AutoModerationCommand } from '#lib/moderation/structures/AutoModerationCommand';

const Root = 'commands/auto-moderation';

/**
 * The configuration of every auto-moderation rule command, declared once and given as the piece options of the
 * `show`, `edit` and `reset` subcommands of the rule (and of the extra ones, such as the `add` and `remove` of the
 * `words`), see {@linkcode AutoModerationCommand}.
 */
export const AutoModerationRules = {
	attachments: {
		commandName: 'automod-attachments',
		localizedNameKey: `${Root}:attachments`,
		adderPropertyName: 'attachments',
		keyEnabled: 'selfmodAttachmentsEnabled',
		keyOnInfraction: 'selfmodAttachmentsSoftAction',
		keyPunishment: 'selfmodAttachmentsHardAction',
		keyPunishmentDuration: 'selfmodAttachmentsHardActionDuration',
		keyPunishmentThreshold: 'selfmodAttachmentsThresholdMaximum',
		keyPunishmentThresholdPeriod: 'selfmodAttachmentsThresholdDuration'
	},
	capitals: {
		commandName: 'automod-capitals',
		localizedNameKey: `${Root}:capitals`,
		adderPropertyName: 'capitals',
		keyEnabled: 'selfmodCapitalsEnabled',
		keyOnInfraction: 'selfmodCapitalsSoftAction',
		keyPunishment: 'selfmodCapitalsHardAction',
		keyPunishmentDuration: 'selfmodCapitalsHardActionDuration',
		keyPunishmentThreshold: 'selfmodCapitalsThresholdMaximum',
		keyPunishmentThresholdPeriod: 'selfmodCapitalsThresholdDuration'
	},
	invites: {
		commandName: 'automod-invites',
		localizedNameKey: `${Root}:invites`,
		adderPropertyName: 'invites',
		keyEnabled: 'selfmodInvitesEnabled',
		keyOnInfraction: 'selfmodInvitesSoftAction',
		keyPunishment: 'selfmodInvitesHardAction',
		keyPunishmentDuration: 'selfmodInvitesHardActionDuration',
		keyPunishmentThreshold: 'selfmodInvitesThresholdMaximum',
		keyPunishmentThresholdPeriod: 'selfmodInvitesThresholdDuration'
	},
	links: {
		commandName: 'automod-links',
		localizedNameKey: `${Root}:links`,
		adderPropertyName: 'links',
		keyEnabled: 'selfmodLinksEnabled',
		keyOnInfraction: 'selfmodLinksSoftAction',
		keyPunishment: 'selfmodLinksHardAction',
		keyPunishmentDuration: 'selfmodLinksHardActionDuration',
		keyPunishmentThreshold: 'selfmodLinksThresholdMaximum',
		keyPunishmentThresholdPeriod: 'selfmodLinksThresholdDuration'
	},
	newlines: {
		commandName: 'automod-newlines',
		localizedNameKey: `${Root}:newlines`,
		adderPropertyName: 'newlines',
		keyEnabled: 'selfmodNewlinesEnabled',
		keyOnInfraction: 'selfmodNewlinesSoftAction',
		keyPunishment: 'selfmodNewlinesHardAction',
		keyPunishmentDuration: 'selfmodNewlinesHardActionDuration',
		keyPunishmentThreshold: 'selfmodNewlinesThresholdMaximum',
		keyPunishmentThresholdPeriod: 'selfmodNewlinesThresholdDuration'
	},
	words: {
		commandName: 'automod-words',
		localizedNameKey: `${Root}:words`,
		resetKeys: [{ key: `${Root}:optionsKeyWords`, value: 'words' }],
		adderPropertyName: 'words',
		keyEnabled: 'selfmodWordsEnabled',
		keyOnInfraction: 'selfmodWordsSoftAction',
		keyPunishment: 'selfmodWordsHardAction',
		keyPunishmentDuration: 'selfmodWordsHardActionDuration',
		keyPunishmentThreshold: 'selfmodWordsThresholdMaximum',
		keyPunishmentThresholdPeriod: 'selfmodWordsThresholdDuration'
	}
} as const satisfies Record<string, AutoModerationCommand.Rule>;
